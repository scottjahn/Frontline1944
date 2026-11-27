// Frontline 1944 game server.
// Serves the game itself (so tablets just open one address) and runs multiplayer battles at /ws.
// Each room is one battle running in a worker thread of its own (battle.js) with the same rules files the browser
// uses. Players' screens get a snapshot 15 times a second and send their controls back.
//   node server/server.js            (PORT, default 8080; GAME_ROOT, default the folder above this one)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Worker } = require('worker_threads');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 8080;
const ROOT = path.resolve(process.env.GAME_ROOT || path.join(__dirname, '..'));
const MAX_ROOMS = +process.env.MAX_ROOMS || 6, MAX_PLAYERS = 8;
const IDLE_CLOSE = 120 * 1000, OVER_CLOSE = 90 * 1000;      // close a room this long after it empties / its battle ends
const FRONTS = ['eu', 'pac', 'mod'];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------- the game's own files
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const PUBLIC = /^\/(index\.html|editor\.html|manifest\.webmanifest|sw\.js|js\/[\w./-]+\.js|icons\/[\w.-]+\.png)$/;
const server = http.createServer((req, res) => {
  let rel; try { rel = decodeURIComponent(req.url.split('?')[0]); } catch (e) { rel = ''; }
  if (rel === '/') rel = '/index.html';
  if (rel === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size })); }
  if (!PUBLIC.test(rel) || rel.includes('..')) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(ROOT, rel), (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- rooms
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';          // no I or O: easy to read out loud
function newCode() {
  for (let n = 0; n < 1000; n++) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!rooms.has(c)) return c; }
  return null;
}
// start a battle; ready(room) once its map is built, or fail(text)
function makeRoom(o, ready, fail) {
  const code = newCode(); if (!code) return fail('The server is full right now.');
  const map = o.map && typeof o.map === 'object' && FRONTS.includes(o.map.base) && o.map.id ? o.map : null;
  const front = map ? 'map-' + map.id : FRONTS.includes(o.front) ? o.front : 'eu';
  const t0 = Date.now();
  const worker = new Worker(path.join(__dirname, 'battle.js'), { workerData: { root: ROOT, front: map ? map.base : front, map, tiers: o.tiers || null, owners: Array.isArray(o.owners) ? o.owners : null } });
  const room = { code, key: crypto.randomBytes(12).toString('hex'), worker, front, map, clients: new Map(), pending: new Map(), emptySince: Date.now(), overAt: 0, ok: false };
  rooms.set(code, room);
  worker.on('message', m => {
    if (m.t === 'ready') { room.ok = true; log(`room ${code} opened: ${front} (map built in ${Date.now() - t0} ms)`); ready(room); }
    else if (m.t === 'packets') { for (const [cid, data] of m.out) { const c = room.clients.get(cid); if (c && c.ws.readyState === 1 && c.ws.bufferedAmount < 2e6) c.ws.send(data); } }
    else if (m.t === 'joined') {
      const c = room.pending.get(m.cid); room.pending.delete(m.cid); if (!c) return;
      room.clients.set(m.cid, c); c.name = m.name;
      send(c.ws, { t: 'welcome', code, id: m.id, team: m.team, host: m.host, startOwned: m.startOwned, players: room.clients.size });
      for (const o of room.clients.values()) if (o !== c) send(o.ws, { t: 'note', text: `${m.name} joined the battle` });
      log(`room ${code}: ${m.name} joined (${room.clients.size} playing)`);
    }
    else if (m.t === 'over') room.overAt = Date.now();
  });
  worker.on('error', e => { log(`room ${code}: battle error`, e && e.stack || e); if (!room.ok) fail('Could not start a battle on the server.'); closeRoom(room, 'the battle hit an error'); });
  worker.on('exit', () => rooms.delete(code));
}
function closeRoom(room, why) {
  if (!rooms.has(room.code)) return;
  rooms.delete(room.code); room.worker.terminate();
  for (const c of room.clients.values()) { send(c.ws, { t: 'closed', text: why }); c.ws.close(); }
  log(`room ${room.code} closed: ${why}`);
}
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (!r.ok) continue;
    if (!r.clients.size && now - r.emptySince > IDLE_CLOSE) closeRoom(r, 'nobody left');
    else if (r.overAt && now - r.overAt > OVER_CLOSE) closeRoom(r, 'the battle is over');
  }
}, 5000);

// ---------------------------------------------------------------- players
function send(ws, m) { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }
let nextCid = 0;
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
wss.on('connection', ws => {
  const cid = ++nextCid; let room = null;
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (room) { if (room.clients.has(cid)) room.worker.postMessage({ t: 'msg', cid, m }); return; }
    if (m.t === 'host') {                                // start a room; the host then joins it with the key
      if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', text: 'The server is full right now. Try again later.' });
      return makeRoom(m, r => send(ws, { t: 'hosted', code: r.code, key: r.key, front: r.front }), text => send(ws, { t: 'error', text }));
    }
    if (m.t === 'join') {
      const r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r || !r.ok) return send(ws, { t: 'error', text: 'No battle with that code. Check the code with whoever is hosting.' });
      if (r.overAt) return send(ws, { t: 'error', text: 'That battle is already over.' });
      if (m.front !== r.front) return send(ws, { t: 'front', front: r.front, map: r.map });   // load the right map first
      if (r.clients.size + r.pending.size >= MAX_PLAYERS) return send(ws, { t: 'error', text: 'That battle is full.' });
      room = r; r.pending.set(cid, { ws });
      r.worker.postMessage({ t: 'join', cid, name: String(m.name || 'Player').slice(0, 24), tiers: m.tiers, host: m.key === r.key });
    }
  });
  ws.on('close', () => {
    if (!room) return;
    const c = room.clients.get(cid); room.clients.delete(cid); room.pending.delete(cid);
    if (!rooms.has(room.code)) return;
    room.worker.postMessage({ t: 'leave', cid });
    if (!room.clients.size) room.emptySince = Date.now();
    if (c) { for (const o of room.clients.values()) send(o.ws, { t: 'note', text: `${c.name} left the battle` }); log(`room ${room.code}: ${c.name} left (${room.clients.size} playing)`); }
  });
});
// drop connections that have silently gone away (a tablet that went to sleep)
setInterval(() => { for (const ws of wss.clients) { if (ws.alive === false) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 15000);

server.listen(PORT, () => log(`Frontline 1944 server on port ${PORT}, game files from ${ROOT}`));

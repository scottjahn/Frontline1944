// Talks to a running game server the way two players' screens would: hosts a room, joins it twice, deploys,
// drives, and checks snapshots and messages come back. Usage (with the server running):
//   node tools/netcheck.js [ws://localhost:8080/ws]
'use strict';
const WebSocket = require('../server/node_modules/ws');
const url = process.argv[2] || 'ws://localhost:8080/ws';
const tiers = { air: 1, land: 1, sea: 1 };
const wait = ms => new Promise(r => setTimeout(r, ms));
function connect() {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(url), c = { ws, msgs: [], snaps: 0, last: null, bytes: 0 };
    ws.on('message', raw => { c.bytes += raw.length; const m = JSON.parse(raw); if (m.t === 's') { c.snaps++; c.last = m; for (const e of m.ev) c.msgs.push(e); } else c.msgs.push(m); });
    ws.on('open', () => ok(c)); ws.on('error', fail);
  });
}
const next = (c, t) => new Promise(ok => { const i = setInterval(() => { const m = c.msgs.find(m => m.t === t); if (m) { clearInterval(i); ok(m); } }, 20); });
(async () => {
  const a = await connect();
  a.ws.send(JSON.stringify({ t: 'host', front: 'eu', tiers }));
  const hosted = await next(a, 'hosted'); console.log('hosted room', hosted.code);
  a.ws.close();
  const p1 = await connect(), p2 = await connect();
  p1.ws.send(JSON.stringify({ t: 'join', code: hosted.code, key: hosted.key, front: 'eu', name: 'Dad', tiers }));
  p2.ws.send(JSON.stringify({ t: 'join', code: hosted.code.toLowerCase(), front: 'pac', name: 'Kid', tiers }));
  const w1 = await next(p1, 'welcome'), wrong = await next(p2, 'front');
  console.log('player 1 welcome:', { host: w1.host, team: w1.team }, '| player 2 on the wrong map is told to load', wrong.front);
  p2.ws.send(JSON.stringify({ t: 'join', code: hosted.code, front: 'eu', name: 'Kid', tiers }));
  const w2 = await next(p2, 'welcome'); console.log('player 2 welcome:', { host: w2.host, team: w2.team });
  await wait(500);
  p1.ws.send(JSON.stringify({ t: 'deploy', id: 'spitfire', col: 1 }));
  p2.ws.send(JSON.stringify({ t: 'deploy', id: 'troops', col: 1 }));
  for (let i = 0; i < 60; i++) {         // three seconds of holding W and fire
    for (const p of [p1, p2]) p.ws.send(JSON.stringify({ t: 'c', k: 1 | 64, y: 1.5, d: [1, 0, 0], p: [0, 0, 0], l: 0 }));
    await wait(50);
  }
  const s = p1.last, me1 = s.me, me2 = p2.last.me;
  const u1 = s.u.find(u => u[0] === me1[0]), u2 = s.u.find(u => u[0] === me2[0]);
  console.log({
    snapshotsPerSecond: +(p1.snaps / 3.5).toFixed(1), kBperSecond: +(p1.bytes / 1024 / 3.5).toFixed(1), units: s.u.length, projectiles: s.p.length,
    player1: u1 && { type: u1[1], speed: u1[9] }, player2: u2 && { type: u2[1], speed: u2[9] },
    controlEvents: [p1, p2].map(p => p.msgs.filter(e => e[0] === 'control').length),
    messages: p1.msgs.filter(e => e[0] === 'msg').slice(0, 4).map(e => e[1]), notes: p1.msgs.filter(e => e.t === 'note').map(e => e.text)
  });
  const ok = u1 && u2 && u1[1] === 'spitfire' && u2[1] === 'troops' && p1.snaps > 30;
  console.log(ok ? 'OK: two players in one battle' : 'PROBLEM');
  p1.ws.close(); p2.ws.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

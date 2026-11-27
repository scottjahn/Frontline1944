'use strict';
// ---------- playing together: this screen's side of a battle that runs on the game server ----------
// In an online battle the rules do not run here. The server sends a snapshot of the battle 15 times a second; this
// file copies it into the same globals the rules would fill (units, projs, POINTS, World, battleT ...) so the screen
// draws it exactly as it draws single player. Movement is smoothed between snapshots, and the player's controls go
// back to the server. The server's side is server/room.js.
const SERVER_KEY = 'frontline1944.server', NAME_KEY = 'frontline1944.name', HOSTKEY_KEY = 'frontline1944.hostkey', NETMAP_KEY = 'frontline1944.netmap';
const Online = {
  on: false, ws: null, code: '', host: false, status: '', players: 0,
  mirror: new Map(), projMap: new Map(), snapT: 0, gap: 1 / 15, sendT: 0, lastBuild: 0,

  // the server's address: what the player typed in once, or this page's own server when the game is served by it
  url() {
    const saved = localStorage.getItem(SERVER_KEY); if (saved) return saved;
    return /^https?:$/.test(location.protocol) && !/github\.io$|^localhost$|^127\./.test(location.hostname) ? location.host : '';
  },
  wsUrl(addr) {
    addr = (addr || '').trim().replace(/\/+$/, ''); if (!addr) return '';
    if (/^wss?:\/\//.test(addr)) return addr.endsWith('/ws') ? addr : addr + '/ws';
    const secure = /^https:\/\//.test(addr) || (!/^http:\/\//.test(addr) && (location.protocol === 'https:' || !/^(localhost|127\.|192\.168\.|10\.)/.test(addr)));
    return (secure ? 'wss://' : 'ws://') + addr.replace(/^https?:\/\//, '') + '/ws';
  },
  name() { return localStorage.getItem(NAME_KEY) || 'Player'; },
  connect(addr, onOpen, onMsg) {
    const u = this.wsUrl(addr); if (!u) { this.fail('Enter the game server address first.'); return null; }
    let ws; try { ws = new WebSocket(u); } catch (e) { this.fail('That server address does not look right.'); return null; }
    ws.onopen = () => onOpen(ws);
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onMsg(m, ws); };
    ws.onerror = () => this.fail(`Could not reach the game server at ${addr}.`);
    return ws;
  },
  fail(text) { this.status = text; if (typeof renderMenu === 'function' && menuTab === 'Play together' && state !== 'playing') renderMenu(); },
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },

  // Host: the server starts a battle on this theatre (with your unlocks and your campaign's front line), then this
  // page reloads into it as its host.
  hostGame(addr) {
    this.status = 'Starting a battle on the server…'; renderMenu();
    this.connect(addr, ws => ws.send(JSON.stringify({ t: 'host', front: TH.custom ? TH.baseId : TH.id, map: TH.custom || null, tiers: Account.data.tiers, owners: POINTS.map(p => p.owner) })),
      (m, ws) => {
        if (m.t === 'hosted') { ws.close(); sessionStorage.setItem(HOSTKEY_KEY, m.key); if (TH.custom) sessionStorage.setItem(NETMAP_KEY, JSON.stringify(TH.custom)); this.go(m.front, m.code); }
        else if (m.t === 'error') { ws.close(); this.fail(m.text); }
      });
  },
  joinGame(code) {
    code = (code || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 4) { this.fail('A battle code is four letters.'); return; }
    this.go(TH.id, code);
  },
  go(front, code) { location.href = location.pathname + '?front=' + encodeURIComponent(front) + '&join=' + code; },
  leave() { if (this.ws) this.ws.close(); location.href = location.pathname + '?front=' + encodeURIComponent(TH.id); },

  // this page was opened to play in a battle (?join=CODE): connect and take part
  start(code) {
    this.code = code; this.status = `Joining battle ${code}…`;
    this.ws = this.connect(this.url(), ws => ws.send(JSON.stringify({ t: 'join', code, front: TH.id, name: this.name(), tiers: Account.data.tiers, key: sessionStorage.getItem(HOSTKEY_KEY) || '' })),
      m => this.onMsg(m));
    if (!this.ws) return;
    this.ws.onclose = () => { if (this.on && state !== 'over') { this.on = false; showBanner('Connection lost', 'The battle carries on without you. Open the menu to go back to single player.'); this.status = 'Disconnected from the battle.'; openMenu(); } };
  },
  onMsg(m) {
    if (m.t === 's') return this.snapshot(m);
    if (m.t === 'welcome') {
      this.on = true; this.host = m.host; this.players = m.players; me.id = m.id; me.team = m.team; startOwned = m.startOwned;
      this.status = `In battle ${m.code}` + (m.host ? ' · you are the host: read this code out to the others' : '');
      showMsg(`Joined battle ${m.code}`, 'good'); renderMenu();
    } else if (m.t === 'front') {          // the battle is on another map: load that one, then join again
      if (m.map) sessionStorage.setItem(NETMAP_KEY, JSON.stringify(m.map));
      this.go(m.front, this.code);
    } else if (m.t === 'note') showMsg(m.text, 'good');
    else if (m.t === 'error' || m.t === 'closed') { this.on = false; this.status = m.text; if (state === 'menu' || state === 'dead') renderMenu(); else showMsg(m.text, 'bad'); }
  },

  // ---- copying a snapshot into the battle globals
  snapshot(s) {
    const now = performance.now() / 1000, seen = new Set();
    this.gap = clamp(now - this.snapT, 0.03, 0.25); this.snapT = now;
    for (const a of s.u) {
      let u = this.mirror.get(a[0]);
      if (!u) { u = this.newUnit(a); if (!u) continue; this.mirror.set(u.id, u); units.push(u); }
      else this.target(u, a);
      seen.add(u.id);
    }
    // shells and bullets: kept by id so their models stay put; between snapshots they fly on along their velocity
    const pseen = new Set();
    for (const a of s.p) {
      let p = this.projMap.get(a[0]);
      if (!p) { p = { id: a[0], kind: a[1], pos: V(), vel: V(), swim: false, tgt: null }; this.projMap.set(p.id, p); }
      p.pos.set(a[2], a[3], a[4]); p.vel.set(a[5], a[6], a[7]); p.swim = !!a[8]; p.tgt = a[9] ? this.mirror.get(a[9]) || null : null; pseen.add(p.id);
    }
    for (const id of this.projMap.keys()) if (!pseen.has(id)) this.projMap.delete(id);
    projs.length = 0; for (const p of this.projMap.values()) projs.push(p);
    s.c.forEach((a, i) => { const p = POINTS[i]; if (!p) return; if (p.owner !== a[0]) { p.owner = a[0]; frontVer++; } p.prog = a[1]; p.contest = !!a[2]; p.post = a[3] ? true : null; });
    const w = s.w; World.water = World.cur.water = w[0]; World.vis = World.cur.vis = w[1]; World.reload = w[2]; World.season = w[3]; World.seasonT = w[4];
    World.icebergs.length = 0; for (const b of s.i) World.icebergs.push({ id: b[0], x: b[1], z: b[2], r: b[3], rot: b[4], k: b[5] });
    battleT = s.b[0]; time = s.b[1];
    s.f.forEach((n, t) => { plots[t] = Array.from({ length: n }, () => ({ unit: null })); });
    const m = s.me; me.money = m[1]; me.deployCd = m[2]; me.stats = m[3];
    const mu = m[0] ? this.mirror.get(m[0]) : null;
    if (mu && me.unit !== mu) { me.unit = mu; onControl(mu); }       // a vehicle we were given before its control message arrived
    if (!mu) me.unit = null;
    if (mu) { const was = mu.diveT; mu.cdGun = m[4]; mu.cdAlt = m[5]; mu.throttleT = m[6]; mu.diveT = m[7]; if (was !== mu.diveT) $('tDive').textContent = mu.diveT ? 'Rise' : 'Dive'; }
    for (const e of s.ev) this.event(e);
    for (const [id, u] of this.mirror) if (!seen.has(id)) this.drop(u);
    if (state === 'shop' && now - this.lastBuild > 0.5) { this.lastBuild = now; renderShop(); }
  },
  newUnit(a) {
    const def = DEFS[a[1]]; if (!def) return null;
    const u = { id: a[0], def, team: a[2], hp: a[10], maxHp: def.hp, pos: V(), vel: V(), yaw: 0, pitch: 0, roll: 0, speed: 0, aimYaw: 0, built: 1, chute: 0, dive: 0, diveT: 0,
      cdGun: 0, cdAlt: 0, throttleT: 1, dead: false, from: null, to: null };
    this.target(u, a); this.settle(u, 1); u.from = u.to; return u;
  },
  // a new position to move toward: from wherever the unit is drawn now
  target(u, a) {
    u.from = u.to ? { x: u.pos.x, y: u.pos.y, z: u.pos.z, yaw: u.yaw, pitch: u.pitch, roll: u.roll, aimYaw: u.aimYaw } : null;
    u.to = { x: a[3], y: a[4], z: a[5], yaw: a[6], pitch: a[7], roll: a[8], aimYaw: a[11] };
    u.team = a[2]; u.speed = a[9]; u.hp = a[10]; u.built = a[12]; u.chute = a[13]; u.dive = a[14]; u.vel.set(a[15], a[16], a[17]);
  },
  // where to draw a unit k of the way from its last drawn spot to its newest one (k > 1 carries on along its course)
  settle(u, k) {
    const f = u.from || u.to, t = u.to, ang = (a, b) => a + angDiff(b, a) * k;
    if (u === me.unit) {                 // your own vehicle: no waiting, drawn at its newest spot carried on by its speed
      const e = Math.min(performance.now() / 1000 - this.snapT, 0.2);
      u.pos.set(t.x + u.vel.x * e, t.y + u.vel.y * e, t.z + u.vel.z * e); u.yaw = t.yaw; u.pitch = t.pitch; u.roll = t.roll; u.aimYaw = t.aimYaw; return;
    }
    u.pos.set(f.x + (t.x - f.x) * k, f.y + (t.y - f.y) * k, f.z + (t.z - f.z) * k);
    u.yaw = ang(f.yaw, t.yaw); u.pitch = ang(f.pitch, t.pitch); u.roll = ang(f.roll, t.roll); u.aimYaw = ang(f.aimYaw, t.aimYaw);
  },
  drop(u) {
    this.mirror.delete(u.id); u.dead = true;
    const i = units.indexOf(u); if (i >= 0) units.splice(i, 1);
    if (me.unit === u) me.unit = null;
  },
  // something happened in the battle: hand it to the same screen code single player uses
  event(e) {
    switch (e[0]) {
      case 'fx': TB.set(e[1][0], e[1][1], e[1][2]); Out.fx(TB, e[2], e[3], e[4], e[5], e[6], e[7]); break;
      case 'sfx': Out.sfx(e[1], e[2] ? TB.set(e[2][0], e[2][1], e[2][2]) : null); break;
      case 'nuke': Out.nuke(); break;
      case 'msg': showMsg(e[1], e[2]); break;
      case 'banner': showBanner(e[1], e[2]); break;
      case 'killed': { const u = this.mirror.get(e[1]); if (!u) break; this.target(u, e[2]); u.from = null; this.settle(u, 1); Out.killed(u); this.drop(u); break; }
      case 'died': Out.died(me, { id: e[1] }); break;
      case 'clear': Out.clearWreck(e[1]); break;
      case 'hurt': Out.hurt(me); break;
      case 'control': { const u = this.mirror.get(e[1]); if (u) { me.unit = u; Out.control(me, u); } break; }
      case 'over': this.on = false; Out.over(e[1] < 0 ? undefined : e[1]); break;
      case 'season': Out.season(World.info); break;
    }
  },

  // every frame: draw everything at its smoothed spot, and send the controls 20 times a second
  frame(dt) {
    const k = clamp((performance.now() / 1000 - this.snapT) / this.gap, 0, 1.5);
    for (const u of units) this.settle(u, k);
    for (const p of projs) p.pos.addScaledVector(p.vel, dt);
    this.sendT -= dt; if (this.sendT > 0 || !this.on) return; this.sendT = 0.05;
    const c = me.ctl, r = v => Math.round(v * 1000) / 1000;
    this.send({ t: 'c', k: (c.w ? 1 : 0) | (c.s ? 2 : 0) | (c.a ? 4 : 0) | (c.d ? 8 : 0) | (c.e ? 16 : 0) | (c.q ? 32 : 0) | (c.fire ? 64 : 0) | (c.alt ? 128 : 0),
      y: r(c.yaw), d: [r(c.aimDir.x), r(c.aimDir.y), r(c.aimDir.z)], p: [Math.round(c.aimPoint.x), Math.round(c.aimPoint.y), Math.round(c.aimPoint.z)], l: c.lock ? c.lock.id : 0 });
  }
};

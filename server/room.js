'use strict';
// ---------- one room's battle on the game server ----------
// Loaded after sim.js inside the room's own sandbox, so it sees the battle's globals directly. It turns what happens
// in the battle into messages for each player's screen, and players' messages into actions in the battle.
// The browser's side of this conversation is js/net.js.
const Net = (() => {
  const outbox = new Map();                  // player -> events waiting for their next snapshot
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
  const P = v => [r1(v.x), r1(v.y), r1(v.z)];
  const all = ev => { for (const q of outbox.values()) q.push(ev); };
  const side = (t, ev) => { for (const [pl, q] of outbox) if (t < 0 || pl.team === t) q.push(ev); };
  const one = (pl, ev) => { const q = outbox.get(pl); if (q) q.push(ev); };

  // a unit as the screens need it: [id, type, team, x, y, z, yaw, pitch, roll, speed, hp, aimYaw, built, chute, dive, vx, vy, vz]
  function unitState(u) {
    return [u.id, u.def.id, u.team, r1(u.pos.x), r2(u.pos.y), r1(u.pos.z), r3(u.yaw), r3(u.pitch), r3(u.roll), r1(u.speed), Math.ceil(u.hp),
      r2(u.aimYaw), r2(u.built), r1(u.chute), r2(u.dive), r1(u.vel.x), r1(u.vel.y), r1(u.vel.z)];
  }

  Out.fx = (pos, c, s0, s1, life, rise, op) => all(['fx', P(pos), c, r2(s0), r2(s1), r2(life), rise || 0, op === undefined ? 0.9 : op]);
  Out.sfx = (type, pos) => all(['sfx', type, pos ? P(pos) : null]);
  Out.nuke = () => all(['nuke']);
  Out.msg = (t, text, cls) => side(t, ['msg', text, cls || '']);
  Out.tell = (pl, text, cls) => one(pl, ['msg', text, cls || '']);
  Out.banner = (t, title, sub) => side(t, ['banner', title, sub || '']);
  Out.killed = u => all(['killed', u.id, unitState(u)]);
  Out.died = (pl, u) => one(pl, ['died', u.id]);
  Out.clearWreck = id => all(['clear', id]);
  Out.hurt = pl => one(pl, ['hurt']);
  Out.control = (pl, u) => one(pl, ['control', u.id]);
  Out.over = w => all(['over', w === undefined ? -1 : w]);
  Out.season = () => all(['season']);

  return {
    // set up the battle: tiers both armies field, and the state of the front carried over from the host's campaign
    setup(o) {
      if (o.tiers) for (const k of ['air', 'land', 'sea']) Rules.tiers[k] = Math.max(1, Math.min(MAX_TIER, o.tiers[k] | 0));
      if (Array.isArray(o.owners) && o.owners.length === POINTS.length) POINTS.forEach((p, i) => { p.owner = [-1, 0, 1].includes(o.owners[i]) ? o.owners[i] : p.owner; });
      setupTeams();
    },
    join(name, tiers, team) {
      const t = {}; for (const k of ['air', 'land', 'sea']) t[k] = Math.max(1, Math.min(MAX_TIER, (tiers && tiers[k]) | 0));
      const pl = addPlayer(team === AXIS ? AXIS : ALLY, { name: String(name || 'Player').slice(0, 24), tiers: t });
      outbox.set(pl, []); return pl;
    },
    leave(pl) { removePlayer(pl); outbox.delete(pl); },
    // what a player's screen asked for
    handle(pl, m) {
      switch (m.t) {
        case 'c': {                          // controls, sent many times a second
          const c = pl.ctl, k = m.k | 0;
          c.w = !!(k & 1); c.s = !!(k & 2); c.a = !!(k & 4); c.d = !!(k & 8); c.e = !!(k & 16); c.q = !!(k & 32); c.fire = !!(k & 64); c.alt = !!(k & 128);
          if (isFinite(m.y)) c.yaw = +m.y;
          if (Array.isArray(m.d) && m.d.every(isFinite)) c.aimDir.set(+m.d[0], +m.d[1], +m.d[2]).normalize();
          if (Array.isArray(m.p) && m.p.every(isFinite)) c.aimPoint.set(+m.p[0], +m.p[1], +m.p[2]);
          c.lock = m.l ? units.find(u => u.id === m.l) || null : null;
          break;
        }
        case 'deploy': if (typeof m.id === 'string') deployPlayer(pl, m.id, m.col | 0); break;
        case 'buy': if (typeof m.id === 'string' && DEFS[m.id]) buyFor(pl, m.id, m.col | 0); break;
        case 'switch': switchUnit(pl); break;
        case 'dive': toggleDive(pl); break;
        case 'end': if (pl.host) endBattle(); break;
      }
    },
    // the part of a snapshot that is the same for everyone, as JSON
    shared() {
      return JSON.stringify({
        u: units.map(unitState),
        p: projs.map(p => [p.id, p.kind, r1(p.pos.x), r1(p.pos.y), r1(p.pos.z), r1(p.vel.x), r1(p.vel.y), r1(p.vel.z), p.swim ? 1 : 0, p.tgt ? p.tgt.id : 0]),
        c: POINTS.map(p => [p.owner, r3(p.prog || 0), p.contest ? 1 : 0, p.post ? 1 : 0]),
        w: [r2(World.water), r2(World.vis), World.reload, World.season, r1(World.seasonT)],
        i: World.icebergs.map(b => [b.id, r1(b.x), r1(b.z), r1(b.r), r2(b.rot), r2(b.k)]),
        b: [r1(battleT), r2(time), battleOver ? 1 : 0], f: plots.map(ps => ps.filter(p => !p.unit).length)
      }).slice(1, -1);
    },
    // one player's snapshot: the shared part, their own state and what happened since the last one
    packet(pl, shared) {
      const u = pl.unit, ev = outbox.get(pl) || [];
      const me = [u ? u.id : 0, Math.floor(pl.money), r1(pl.deployCd), pl.stats, u ? r2(u.cdGun) : 0, u ? r2(u.cdAlt) : 0, u ? r2(u.throttleT) : 1, u ? u.diveT : 0];
      outbox.set(pl, []);
      return '{"t":"s",' + shared + ',"me":' + JSON.stringify(me) + ',"ev":' + JSON.stringify(ev) + '}';
    },
    info() { return { front: TH.id, startOwned, players: players.length, over: battleOver }; }
  };
})();

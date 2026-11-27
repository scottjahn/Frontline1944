'use strict';
// ====================================================================
//  Frontline 1944 - the rules of the battle
//  Everything in here runs without a screen: in the browser for single player, or in Node on a game server.
//  It never touches the page, WebGL or sound. What players should see and hear goes out through Out, and what
//  they do comes in through each player's ctl (see controlUnit).
// ====================================================================
const units = [], projs = [];
let time = 0, uid = 0, battleT = BATTLE_LEN, battleOver = false, raidT = 28, crewT = 6, capT = 0, incomeT = INCOME_PERIOD, frontVer = 0;
let startOwned = [0, 0];
const teamAI = [{ budget: 250, timer: 6 }, { budget: 250, timer: 4 }];
const plots = [[], []];
// the tiers both armies may field (single player: the tiers the player has unlocked)
const Rules = { tiers: { air: 1, land: 1, sea: 1 } };
const V = () => new THREE.Vector3();
const T1 = V(), T2 = V(), T3 = V(), TA = V(), TB = V(), TC = V();

function fwd(yaw, pitch, out) { const c = Math.cos(pitch); return (out || V()).set(Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c); }
function angDiff(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function hdist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function ground(x, z) { return Math.max(terrainH(x, z), World.water); }
function tierOk(id, tiers) { const d = DEFS[id]; return !!d && (d.tier || 1) <= (tiers[d.domain] || 1); }
function has(id) { return tierOk(id, Rules.tiers); }

// -------------------------------------------------------------- what goes out to the players
// The screen (game.js) or the network replaces these. team -1 means everyone; pl is one player.
const Out = {
  fx(pos, color, s0, s1, life, rise, op) { }, sfx(type, pos) { }, nuke(pos) { },
  msg(team, text, cls) { }, tell(pl, text, cls) { }, banner(team, title, sub) { },
  killed(u) { }, died(pl, u) { }, clearWreck(id) { }, hurt(pl) { }, control(pl, u) { },
  over(winner) { }, season(info) { }
};
World.onSeason = s => Out.season(s);
function fx(pos, color, s0, s1, life, rise, op) { Out.fx(pos, color, s0, s1, life, rise, op); }
function sfx(type, pos) { Out.sfx(type, pos); }
function explode(pos, size) {
  fx(pos, 0xffd060, size * 0.3, size, 0.35); fx(pos, 0xff6a10, size * 0.2, size * 0.75, 0.55);
  fx(pos, 0x2e2e2e, size * 0.4, size * 1.5, 1.8, 7, 0.6);
  sfx(size > 12 ? 'boom' : 'shell', pos);
}
function splashFx(pos, size) { TC.set(pos.x, World.water, pos.z); fx(TC, 0xffffff, size * 0.25, size, 0.7, 9, 0.75); sfx('splash', pos); }
function say(team, text, cls) { Out.msg(team, text, cls); }
function tell(pl, text, cls) { if (pl) Out.tell(pl, text, cls); }
function tellU(u, text, cls) { if (u && u.ctrl) Out.tell(u.ctrl, text, cls); }

// -------------------------------------------------------------- players
// A player is a person in the battle: their side, the vehicle they command (if any), their war chest and the
// controls they are holding. Units without a player are flown, driven and sailed by the computer.
const players = [];
function blankStats() { return { kills: 0, defect: 0, caps: 0, credits: 0, killCr: 0, capCr: 0 }; }
function blankCtl() { return { w: false, s: false, a: false, d: false, e: false, q: false, fire: false, alt: false, yaw: 0, aimDir: V().set(0, 0, 1), aimPoint: V(), lock: null }; }
let playerId = 0;
function addPlayer(team, o) {
  o = o || {};
  const pl = { id: ++playerId, name: o.name || 'Player', team, unit: null, money: 600, deployCd: 0, hqMsgT: -99,
    tiers: o.tiers || Rules.tiers, stats: blankStats(), ctl: blankCtl() };
  players.push(pl); return pl;
}
function removePlayer(pl) {
  const i = players.indexOf(pl); if (i >= 0) players.splice(i, 1);
  if (pl.unit && pl.unit.ctrl === pl) pl.unit.ctrl = null;
  pl.unit = null;
}
function teamPlayers(team) { return players.filter(p => p.team === team); }

// -------------------------------------------------------------- units
function spawn(id, team, x, z, o) {
  o = o || {}; const d = DEFS[id];
  const u = {
    id: ++uid, def: d, team, hp: d.hp, maxHp: d.hp, pos: V(), prev: V(), vel: V(), steer: V(),
    yaw: o.yaw !== undefined ? o.yaw : FACE[team] * Math.PI / 2, pitch: 0, roll: 0, speed: 0,
    throttle: 0, turnIn: 0, throttleT: 1, aimYaw: 0, cdGun: rnd(0, 1), cdAlt: rnd(1, 4), cdAA: 0,
    target: null, aaTarget: null, thinkT: rnd(0, 0.6), aaT: rnd(0, 0.5), breakT: 0, breakPt: V(), patrol: null,
    bombQ: 0, bombT: 0, dead: false, built: o.build ? 0 : 1, raid: !!o.raid, ctrl: null,
    dive: 0, diveT: 0, cdDC: rnd(0, 2), takeoff: false, hv: V(), mine: false, cargo: null, chute: 0
  };
  u.aimYaw = u.yaw;
  if (d.domain === 'air') { u.pos.set(x, o.alt || 140, z); u.speed = d.speed; }
  else if (d.domain === 'sea') u.pos.set(x, World.water, z);
  else u.pos.set(x, d.model === 'seafort' ? 0 : terrainH(x, z), z);
  u.prev.copy(u.pos);
  fwd(u.yaw, 0, u.steer);
  units.push(u);
  return u;
}
function airportOf(team) { for (const u of units) if (u.def.model === 'airport' && u.team === team) return u; return null; }
// aircraft start on the airport runway, ground units at the base, ships off the dock
// ---- campaign geometry: capture points, objectives and the front line ----
// the first point from a team's home side that it does not hold: that is where it attacks. null = it holds the whole lane
function reach(team, lane) {
  if (team === ALLY) { for (let c = 0; c < COLS; c++) if (PT(c, lane).owner !== ALLY) return PT(c, lane); }
  else for (let c = COLS - 1; c >= 0; c--) if (PT(c, lane).owner !== AXIS) return PT(c, lane);
  return null;
}
// unit vector from a place in a lane back toward that team's own rear
function behind(team, lane, col) {
  const N = NODE[lane], a = N[col + 1], b = N[team === ALLY ? col : col + 2], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return [(b.x - a.x) / l, (b.z - a.z) / l];
}
// where a side falls back to when it holds nothing in a lane. The Allies have no foothold across the water
// then: their ground forces have to land at the first point of the chain.
function homeSpot(team, lane) {
  if (lane !== SEA_LANE && team === ALLY) { const p = PT(0, lane); return { x: p.x, z: p.z, lane, col: 0 }; }
  const n = NODE[lane][team === ALLY ? 0 : COLS + 1]; return { x: n.x, z: n.z, lane, col: team === ALLY ? 0 : COLS - 1 };
}
// where a team musters in a lane: its foremost held point (no further forward than column `col`, if given)
function stage(team, lane, col) {
  const s = team === ALLY ? 1 : -1, o = reach(team, lane);
  let c = o ? o.col - s : (team === ALLY ? COLS - 1 : 0);
  if (col !== undefined) c = team === ALLY ? Math.min(c, col) : Math.max(c, col);
  for (; c >= 0 && c < COLS; c -= s) if (PT(c, lane).owner === team) return PT(c, lane);
  return homeSpot(team, lane);
}
// position along a lane's chain of places; idx may be fractional (0 = Allied home ... COLS + 1 = Axis home)
function lanePos(l, idx) {
  const N = NODE[l], i = clamp(Math.floor(idx), 0, N.length - 2), t = idx - i;
  return { x: lerp(N[i].x, N[i + 1].x, t), z: lerp(N[i].z, N[i + 1].z, t) };
}
// the front in a lane lies half way between the foremost Allied point and the foremost Axis point
function frontIdx(lane) {
  let a = -1, b = COLS;
  for (let c = 0; c < COLS; c++) { const o = PT(c, lane).owner; if (o === ALLY) a = Math.max(a, c); else if (o === AXIS) b = Math.min(b, c); }
  return clamp((a + b + 2) / 2, 0.5, COLS + 0.5);
}
function frontPos(lane) { return lanePos(lane, frontIdx(lane)); }
// the front line as a path: from out at sea, through each lane's front, to deep inland
function frontPath() {
  const f0 = frontPos(0), f1 = frontPos(1), f2 = frontPos(2), ext = (a, b) => { const l = Math.hypot(a.x - b.x, a.z - b.z) || 1; return [a.x + (a.x - b.x) / l * 900, a.z + (a.z - b.z) / l * 900]; };
  return [ext(f2, f1), [f2.x, f2.z], [f1.x, f1.z], [f0.x, f0.z], ext(f0, f1)];
}
// a point can only be taken by the side that already holds its neighbour (or its own home edge): no leap-frogging
function canCap(p, team) {
  if (p.eng) return team === ALLY ? (p.col === 0 || ENG[p.col - 1].owner === ALLY) : (p.col === ENG.length - 1 ? calaisHeld() : ENG[p.col + 1].owner === AXIS);
  return team === ALLY ? (p.col === 0 || PT(p.col - 1, p.lane).owner === ALLY) : (p.col === COLS - 1 || PT(p.col + 1, p.lane).owner === AXIS);
}
// ---- the Allied homeland: the Axis can only invade while they hold the invasion point (Calais / Wake)
function invasionOpen() { return PT(INVADE.col, INVADE.lane).owner === AXIS; }
const calaisHeld = invasionOpen;
// the next English point a side has to take (Allies work outward from home, the Axis inland from Dover); null = it holds them all
function engObjective(team) {
  if (team === ALLY) { for (const p of ENG) if (p.owner !== ALLY) return p; }
  else for (let c = ENG.length - 1; c >= 0; c--) if (ENG[c].owner !== AXIS) return ENG[c];
  return null;
}
// where the Allies muster in England: the last point they still hold before the fighting, or the home base
function engStage() {
  const o = engObjective(ALLY); if (!o) return ENG[ENG.length - 1];
  return o.col > 0 ? ENG[o.col - 1] : { x: BASE[ALLY].x + FACE[ALLY] * 260, z: BASE[ALLY].z, lane: ENG_LANE, col: 0 };
}
function engThreat() { return ENG.some(p => p.owner !== ALLY) || units.some(u => u.team === AXIS && u.def.domain === 'land' && u.lane === ENG_LANE); }
function beachNear(x, z) {             // downhill from a place to the nearest shore; n points inland
  let g = 0; while (sdf(x, z) > 0 && g++ < 400) { const n = sdGrad(x, z); x -= n[0] * 10; z -= n[1] * 10; }
  return { x, z, n: sdGrad(x, z) };
}
// landing craft carry Axis ground forces from the invasion point to the beaches of the Allied homeland
function ferry(ids) {
  const src = PT(INVADE.col, INVADE.lane), dst = ENG[ENG.length - 1];
  const u = sealift(AXIS, ids, dst, INVADE.fromSea ? null : src);
  say(ALLY, `WARNING: ${TEAM_NAME[AXIS]} landing craft are ${INVADE.fromSea ? 'closing on' : 'crossing from ' + src.name + ' to'} ${dst.name}!`, 'bad');
  return u;
}
// ---- island warfare (the Pacific): ground forces cannot drive from one island to the next, so they go ashore
// on a beach of the island they are attacking. The beach faces the way the landing comes from.
function beachhead(o, from) {
  let dx = from.x - o.x, dz = from.z - o.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  let x = o.x, z = o.z, g = 0;
  while (sdf(x, z) > 0 && g++ < 400) { x += dx * 10; z += dz * 10; }
  return { x: x - dx * 110, z: z - dz * 110 };
}
// where ground forces of a lane enter the fight: p = the spot, assault = landing on an enemy island, o = what they attack
function landZone(team, lane, col) {
  const sp = stage(team, lane, col);
  if (!TH.islands) return { p: sp };
  const o = reach(team, lane) || (team === ALLY ? { x: BASE[AXIS].x, z: BASE[AXIS].z, lane, col: COLS - 1 } : null);
  if (!o) return { p: sp };
  const held = sp.owner === team;
  // the computer sends a third of its ground forces to stiffen the island it already holds; the player
  // lands when they pick a sector the Allies do not hold yet
  const assault = !held || (col === undefined ? Math.random() < 0.65 : !POINTS.some(p => secOf(p) === col && p.owner === team));
  if (!assault || (held && islandOf(sp.x, sp.z) === islandOf(o.x, o.z))) return { p: sp };
  const b = beachhead(o, held ? sp : NODE[lane][team === ALLY ? 0 : COLS + 1]);
  return { p: { x: b.x, z: b.z, lane, col: o.col }, assault: true, o };
}
// a headquarters can only be hurt once the enemy holds every other capture point on the map (homeland included)
function hqLeft(team) { return POINTS.filter(p => p.owner !== 1 - team).length; }
function hqOpen(team) { return hqLeft(team) === 0; }
function ownedBy(team) { return POINTS.filter(p => p.owner === team).length; }
function allyOwned() { return ownedBy(ALLY); }
// a random spot on dry land (or in deep water) between r0 and r1 from a centre, preferring the side given by bv
function landSpot(cx, cz, r0, r1, bv) {
  for (let i = 0; i < 30; i++) {
    const a = rnd(0, 6.283), r = rnd(r0, r1); let dx = Math.sin(a) * r, dz = Math.cos(a) * r;
    if (bv && i < 16 && dx * bv[0] + dz * bv[1] < 0) { dx = -dx; dz = -dz; }
    if (sdf(cx + dx, cz + dz) > 45) return [cx + dx, cz + dz];
  }
  return [cx, cz];
}
function seaSpot(cx, cz, r0, r1, bv) {
  for (let i = 0; i < 30; i++) {
    const a = rnd(0, 6.283), r = rnd(r0, r1); let dx = Math.sin(a) * r, dz = Math.cos(a) * r;
    if (bv && i < 16 && dx * bv[0] + dz * bv[1] < 0) { dx = -dx; dz = -dz; }
    if (sdf(cx + dx, cz + dz) < -150) return [cx + dx, cz + dz];
  }
  return [cx, cz];
}
const NV = { x: 0, z: 0 };
function carrierOf(team, near, maxD) {
  let best = null, bd = maxD;
  for (const u of units) if (u.team === team && u.def.role === 'carrier' && !u.ctrl) { const dd = Math.hypot(u.pos.x - near.x, u.pos.z - near.z); if (dd < bd) { bd = dd; best = u; } }
  return best;
}
// catapult an aircraft off a carrier's flight deck
function deckLaunch(id, c, slot) {
  const d = DEFS[id], y = c.yaw, k = c.def.len * 0.3 - (slot || 0) * 16;
  const u = spawn(id, c.team, c.pos.x + Math.sin(y) * k, c.pos.z + Math.cos(y) * k, { alt: World.water + 6.6 + (d.gear || 1.6), yaw: y });
  u.speed = d.heli ? 0 : d.speed * 0.7; u.pitch = 0.12; fwd(y, 0.22, u.steer);
  u.breakT = 5; u.breakPt.set(c.pos.x + Math.sin(y) * 900, 170, c.pos.z + Math.cos(y) * 900);
  TC.copy(u.pos); fx(TC, 0xffffff, 1, 5, 0.6, 2, 0.5);
  return u;
}
function launchWing(c) {
  const id = (c.team === ALLY ? ['p38', 'mustang', 'spitfire'] : ['bf110', 'fw190', 'bf109']).find(i => has(i));
  let n = 0; for (const u of units) if (u.wingOf === c) n++;
  if (n >= 4) { tellU(c, 'The whole air wing is already airborne.'); return false; }
  const k = Math.min(2, 4 - n);
  for (let i = 0; i < k; i++) deckLaunch(id, c, i).wingOf = c;
  say(c.team, `${c.def.name} launched ${k} ${DEFS[id].name}${k > 1 ? 's' : ''}`, 'good');
  return true;
}
// Where things enter the battle. Combat units arrive just behind their side's front (or behind sector `col` when a
// player picks one); supply vehicles work from the home base. Aircraft use the home runway, a carrier deck, or arrive airborne.
function spawnAt(id, team, col) {
  const d = DEFS[id], b = BASE[team], s = team === ALLY ? 1 : -1, f = FACE[team], ap = AIRPORT[team], rear = !!NONCOMBAT[d.role];
  if (d.domain === 'air') {
    if (rear || col === -1) {             // supply flights, and anyone deploying in the homeland, use the home runway
      if (!airportOf(team)) return spawn(id, team, clamp(ap.x - f * 900, -MAP.x, MAP.x), ap.z + rnd(-200, 200), { alt: 160 + rnd(0, 40) });   // airfield lost: fly in from the rear
      if (d.heli) { const x = ap.x + 62 + rnd(-6, 6), z = ap.z - 29 + rnd(-6, 6); return spawn(id, team, x, z, { alt: terrainH(x, z) + 2.3 }); }
      const x = ap.x - f * 150, z = ap.z + rnd(-7, 7);
      const u = spawn(id, team, x, z, { alt: terrainH(x, z) + (d.gear || 1.5), yaw: f * Math.PI / 2 }); u.takeoff = true; u.speed = 0; return u;
    }
    const sp = stage(team, col === undefined ? Math.floor(Math.random() * LANES) : 1, col);
    if (col !== undefined) { const c = carrierOf(team, sp, 3200); if (c) return deckLaunch(id, c, 0); }
    const bv = behind(team, sp.lane, sp.col), r = rnd(900, 1500);
    const x = clamp(sp.x + bv[0] * r + rnd(-300, 300), -MAP.x, MAP.x), z = clamp(sp.z + bv[1] * r + rnd(-300, 300), -MAP.z, MAP.z);
    return spawn(id, team, x, z, { alt: d.heli ? ground(x, z) + 60 : 170 + rnd(0, 40), yaw: Math.atan2(sp.x - x, sp.z - z) });
  }
  if (d.domain === 'land') {
    if (rear) { const q = landSpot(b.x + f * 190, b.z, 0, 110); return spawn(id, team, q[0], q[1]); }
    let lane = Math.random() < 0.5 ? 0 : 1, sp = col === -1 ? engStage() : stage(team, lane, col);
    if (col === -1) lane = ENG_LANE;
    else if (col !== undefined) { const o = stage(team, 1 - lane, col); if ((o.col - sp.col) * s > 0) { sp = o; lane = 1 - lane; } }
    if (col !== -1) {
      const lz = landZone(team, lane, col);
      if (lz.assault) {                   // amphibious landing on the beach of the island under attack
        const q = landSpot(lz.p.x, lz.p.z, 0, 70), u = spawn(id, team, q[0], q[1], { yaw: Math.atan2(lz.o.x - q[0], lz.o.z - q[1]) });
        u.lane = lane; u.landedAt = lz.o; TC.set(q[0], World.water, q[1]); splashFx(TC, 8); return u;
      }
    }
    const bv = behind(team, sp.lane, sp.col), q = landSpot(sp.x, sp.z, 50, 160, bv);
    const u = spawn(id, team, q[0], q[1], { yaw: Math.atan2(-bv[0], -bv[1]) }); u.lane = lane; return u;
  }
  if (rear) { const P = HOME[team].port, q = seaSpot(P.x, P.z, 0, 160); return spawn(id, team, q[0], q[1], { yaw: HOME[team].dockYaw }); }
  const sp = stage(team, SEA_LANE, col), bv = behind(team, sp.lane, sp.col), q = seaSpot(sp.x, sp.z, 120, 380, bv);
  return spawn(id, team, q[0], q[1], { yaw: Math.atan2(-bv[0], -bv[1]) });
}
// taken out of the battle without a fight (flew home, shipped out, a player's old vehicle withdrawn): no wreck
function despawn(u) {
  u.dead = true; const i = units.indexOf(u); if (i >= 0) units.splice(i, 1);
}
// ---- reinforcements: ground forces arrive by military cargo plane (parachute) or by landing ship
function airlift(team, ids) {
  const lane = Math.random() < 0.5 ? 0 : 1, sp = stage(team, lane), bv = behind(team, sp.lane, sp.col), lz = landZone(team, lane);
  const q = lz.assault ? landSpot(lz.p.x, lz.p.z, 0, 90) : landSpot(sp.x, sp.z, 60, 220, bv);
  const cx = v => clamp(v, -MAP.x - 100, MAP.x + 100), cz = v => clamp(v, -MAP.z - 100, MAP.z + 100);
  const u = spawn(team === ALLY ? 'c54' : 'me323', team, cx(q[0] + bv[0] * 1700), cz(q[1] + bv[1] * 1700), { alt: 190, yaw: Math.atan2(-bv[0], -bv[1]) });
  u.cargo = ids; u.dropLane = lane; u.dropPt = V().set(q[0], terrainH(q[0], q[1]) + 100, q[1]);
  u.exitPt = V().set(cx(q[0] + bv[0] * 2600 + rnd(-300, 300)), 230, cz(q[1] + bv[1] * 2600 + rnd(-300, 300)));
  return u;
}
function paradrop(u) {
  for (const id of u.cargo) {
    const x = u.pos.x + rnd(-25, 25), z = u.pos.z + rnd(-25, 25), n = spawn(id, u.team, x, z);
    n.chute = Math.max(5, u.pos.y - terrainH(x, z) - 6);
    n.pos.y = terrainH(x, z) + n.chute; n.prev.copy(n.pos); n.lane = u.dropLane;
    say(u.team, `${u.def.name} dropped reinforcements: ${n.def.name}`, 'good');
  }
  u.cargo = null;
}
// to: the place to land near (default: the side's foremost coast town). from: a held port to sail from (default: in from the open sea)
function sealift(team, ids, to, from) {
  to = to || landZone(team, 1).p;
  const b = beachNear(to.x, to.z), n = b.n; let sx, sz;
  if (from) { const f = beachNear(from.x, from.z), q = seaSpot(f.x - f.n[0] * 200, f.z - f.n[1] * 200, 0, 120); sx = q[0]; sz = q[1]; }
  else { let k = 900; while (k > 200 && sdf(b.x - n[0] * k, b.z - n[1] * k) > -100) k -= 100; sx = b.x - n[0] * k; sz = b.z - n[1] * k; }
  const u = spawn(team === ALLY ? 'lst' : 'mfp', team, sx, sz, { yaw: Math.atan2(b.x - sx, b.z - sz) });
  u.cargo = ids; u.landLane = to.eng ? ENG_LANE : to.lane === 0 ? 0 : 1;
  u.beach = { x: b.x - n[0] * 50, z: b.z - n[1] * 50 }; u.landPt = { x: b.x + n[0] * 35, z: b.z + n[1] * 35 }; u.exit = { x: sx, z: sz };
  return u;
}
function unload(u) {
  for (const id of u.cargo) { const q = landSpot(u.landPt.x, u.landPt.z, 0, 45); spawn(id, u.team, q[0], q[1], { yaw: u.yaw }).lane = u.landLane; }
  say(u.team, `${u.def.name} landed ${u.cargo.length} units on the beach`, 'good');
  if (u.team === AXIS && u.landLane === ENG_LANE) say(ALLY, `${TEAM_NAME[AXIS]} troops are ashore in ${HOME_NAME}! ${u.cargo.length} units landed near ${ENG[ENG.length - 1].name}.`, 'bad');
  u.cargo = null;
}
function requisition(id, team) {
  const d = DEFS[id];
  if (d.domain !== 'land' || d.role === 'cargo') return spawnAt(id, team);
  const landers = units.filter(u => u.team === team && u.def.role === 'lander').length;
  if (team === AXIS && invasionOpen() && landers < 2 && Math.random() < 0.3) return ferry([id, 'grenadier']);        // invade the Allied homeland
  if (team === ALLY && engThreat() && Math.random() < 0.45) return spawnAt(id, team, -1);                           // home forces turn out to meet them
  if (Math.random() < 0.3 && !landers)
    return sealift(team, [id].concat(team === ALLY ? ['troops', 'jeep'] : ['grenadier', 'kubel']));
  return airlift(team, [id]);
}

// -------------------------------------------------------------- movement
function moveAir(u, dt) {
  const d = u.def, dir = u.steer;
  if (u.takeoff) {                     // roll down the runway, then climb out
    u.speed = Math.min(d.speed, u.speed + d.speed * 0.3 * dt); u.roll = 0;
    const lift = u.speed > d.speed * 0.6;
    u.pitch = lift ? Math.min(0.28, u.pitch + 0.35 * dt) : 0;
    fwd(u.yaw, u.pitch, T3); u.pos.addScaledVector(T3, u.speed * dt);
    const gy = terrainH(u.pos.x, u.pos.z) + (d.gear || 1.5);
    if (!lift || u.pos.y < gy) u.pos.y = gy;
    if (u.pos.y > gy + 28) { u.takeoff = false; fwd(u.yaw, 0.15, u.steer); }
    return;
  }
  if (Math.abs(u.pos.x) > MAP.x + 200 || Math.abs(u.pos.z) > MAP.z + 200) { dir.set(-u.pos.x, 60 - u.pos.y * 0.2, -u.pos.z).normalize(); }
  if (u.pos.y > 520 && dir.y > 0) { dir.y = 0; dir.normalize(); }
  const wy = Math.atan2(dir.x, dir.z), wp = Math.asin(clamp(dir.y, -1, 1));
  const dy = angDiff(wy, u.yaw), mt = d.turn * dt;
  u.yaw += clamp(dy, -mt, mt);
  u.pitch = clamp(u.pitch + clamp(wp - u.pitch, -mt * 0.8, mt * 0.8), -1.2, 1.2);
  u.roll += (clamp(-dy * 1.6, -1.25, 1.25) - u.roll) * Math.min(1, dt * 4);
  u.speed += (d.speed * u.throttleT - u.speed) * Math.min(1, dt * 0.8);
  fwd(u.yaw, u.pitch, T3); u.pos.addScaledVector(T3, u.speed * dt);
  if (u.pos.y < ground(u.pos.x, u.pos.z) + 1.2) { tellU(u, 'You flew into the ' + (terrainH(u.pos.x, u.pos.z) > World.water ? 'ground' : 'sea') + '.', 'bad'); kill(u, null, null); }
}
function moveHeli(u, dt) {
  const d = u.def, k = Math.min(1, dt * 1.6);
  u.vel.x += (u.hv.x - u.vel.x) * k; u.vel.z += (u.hv.z - u.vel.z) * k; u.vel.y += (u.hv.y - u.vel.y) * Math.min(1, dt * 2.2);
  u.pos.addScaledVector(u.vel, dt);
  u.pos.x = clamp(u.pos.x, -MAP.x - 100, MAP.x + 100); u.pos.z = clamp(u.pos.z, -MAP.z - 100, MAP.z + 100);
  const g = ground(u.pos.x, u.pos.z) + 2.2;
  if (u.pos.y < g) u.pos.y = g; if (u.pos.y > 420) u.pos.y = 420;
  u.yaw += clamp(angDiff(u.aimYaw, u.yaw), -d.turn * dt, d.turn * dt);
  const sy = Math.sin(u.yaw), cy = Math.cos(u.yaw), f = u.vel.x * sy + u.vel.z * cy, l = u.vel.x * cy - u.vel.z * sy;
  u.pitch += (-f / d.speed * 0.32 - u.pitch) * Math.min(1, dt * 3);
  u.roll += (-l / d.speed * 0.32 - u.roll) * Math.min(1, dt * 3);
  u.speed = Math.hypot(u.vel.x, u.vel.z);
}
function moveLand(u, dt) {
  const d = u.def;
  if (u.chute > 0) {                   // still under the parachute
    u.chute = Math.max(0, u.chute - 26 * dt); u.pos.y = terrainH(u.pos.x, u.pos.z) + u.chute; u.speed = 0;
    return;
  }
  u.yaw += u.turnIn * d.turn * dt;
  const here = terrainH(u.pos.x, u.pos.z), wet = here < World.water;
  u.cover = forestAt(u.pos.x, u.pos.z);         // woods and mountains are slow going
  const want = u.throttle * d.speed * (u.throttle < 0 ? 0.5 : 1) * (wet ? 0.45 : 1) * (1 - 0.35 * Math.min(1, u.cover)) * (1 - 0.45 * roughAt(u.pos.x, u.pos.z));
  u.speed += (want - u.speed) * Math.min(1, dt * 3);
  const nx = clamp(u.pos.x + Math.sin(u.yaw) * u.speed * dt, -MAP.x, MAP.x), nz = clamp(u.pos.z + Math.cos(u.yaw) * u.speed * dt, -MAP.z, MAP.z);
  const nh = terrainH(nx, nz);
  if (nh < World.water - 1.3 && nh < here) u.speed = 0;
  else { u.pos.x = nx; u.pos.z = nz; }
  u.pos.y = terrainH(u.pos.x, u.pos.z);
  if (d.model !== 'squad') {
    const s = Math.sin(u.yaw) * 3, c = Math.cos(u.yaw) * 3;
    u.pitch = Math.atan2(terrainH(u.pos.x + s, u.pos.z + c) - terrainH(u.pos.x - s, u.pos.z - c), 6);
  }
}
function moveSea(u, dt) {
  const d = u.def;
  if (d.sub) u.dive = clamp(u.dive + (u.diveT > 0.5 ? dt : -dt) * 0.45, 0, 1);
  const top = d.speed * (d.sub ? 1 - 0.35 * u.dive : 1);
  u.speed += (u.throttle * top * (u.throttle < 0 ? 0.4 : 1) - u.speed) * Math.min(1, dt * 0.6);
  u.yaw += u.turnIn * d.turn * dt * clamp(Math.abs(u.speed) / (d.speed * 0.4), 0.25, 1);
  const here = terrainH(u.pos.x, u.pos.z);
  const nx = clamp(u.pos.x + Math.sin(u.yaw) * u.speed * dt, -MAP.x, MAP.x), nz = clamp(u.pos.z + Math.cos(u.yaw) * u.speed * dt, -MAP.z, MAP.z);
  const nh = terrainH(nx, nz);
  if (nh > World.water - 2.6 && nh > here) { u.speed *= 0.5; if (!u.aground) { u.aground = true; tellU(u, 'Shallows! You are running aground.', 'bad'); } }
  else { u.pos.x = nx; u.pos.z = nz; u.aground = false; }
  u.pos.y = World.water - (d.sub ? u.dive * d.diveDepth : 0);
  u.roll = Math.sin(time * 0.9 + u.id) * 0.025 - u.turnIn * 0.04 * (u.speed / d.speed);
  u.pitch = Math.sin(time * 0.7 + u.id * 2) * 0.012;
}

// -------------------------------------------------------------- weapons
let projId = 0;
function addProj(kind, o, vel, owner, dmg, splash, life) {
  const p = { id: ++projId, kind, pos: o.clone(), prev: o.clone(), vel, team: owner.team, owner, pl: owner.ctrl || null, dmg, splash, life, swim: false };
  projs.push(p); return p;
}
// stealth (lowObs) aircraft can only be spotted, locked and shot at from much closer in
// how close an enemy has to be before it is spotted: stealth, and ground forces hidden in the woods, need a closer look
function spotR(e, r) { return (e.def.lowObs ? r * 0.4 : r) * (e.cover > 0.35 ? 0.6 : 1); }
// ---- homing air-to-air missiles (Modern Era fighters)
// the enemy aircraft closest to a direction, within a cone of maxAng radians and the missile's range
function airLock(team, from, dir, maxAng, range) {
  let best = null, ba = maxAng;
  for (const e of units) {
    if (e.team === team || e.dead || e.def.domain !== 'air') continue;
    centerOf(e, TC).sub(from); const dist = TC.length(); if (dist > spotR(e, range * World.vis) || dist < 20) continue;
    const ang = Math.acos(clamp(TC.dot(dir) / dist, -1, 1)); if (ang < ba) { ba = ang; best = e; }
  }
  return best;
}
// a player's seeker lock, as their screen reported it: only a live enemy aircraft counts
function ctlLock(u) {
  const t = u.ctrl && u.ctrl.ctl.lock;
  return t && !t.dead && t.team !== u.team && t.def.domain === 'air' ? t : null;
}
function fireMissile(u, aim, lock) {
  const a = u.def.alt, gnd = u.def.domain !== 'air', dir = fwd(u.yaw, u.pitch, V());
  const tgt = u.ctrl ? ctlLock(u) : lock || (u.target && u.target.def.domain === 'air' ? u.target : null);
  const o = T2.copy(u.pos);
  if (gnd) {                                 // surface-to-air: rises off the launcher rails, nosing up toward the target
    o.y += (u.def.centerY || 1.5) + 2.5;
    dir.subVectors(tgt ? centerOf(tgt, T3) : aim, o).normalize(); dir.y += 0.6; dir.normalize();
  } else {
    o.addScaledVector(dir, u.def.radius * 0.6); o.y -= 1.2;
    if (!tgt) dir.subVectors(aim, o).normalize().lerp(fwd(u.yaw, u.pitch, T3), 0.5).normalize();   // no lock: fly where the pilot aims
  }
  const p = addProj('aam', o, dir.multiplyScalar(gnd ? 50 : Math.max(u.speed, 60) + 40), u, a.dmg, a.splash, a.range / a.vel * 1.5);
  if (gnd) fx(o, 0xd8d4cc, 1.4, 5, 1.2, 1, 0.8);
  p.tgt = tgt; p.vmax = a.vel; p.turn = a.turn;
  if (!u.ctrl) u.cdAlt *= 1.8;
  sfx('shell', u.pos);
  if (tgt && tgt.ctrl && time - (tgt.warnT || -99) > 3) { tgt.warnT = time; tell(tgt.ctrl, gnd ? 'SAM LAUNCH! Turn hard to shake it off!' : 'MISSILE INBOUND! Turn hard to shake it off!', 'bad'); }
  if (u.ctrl) tell(u.ctrl, tgt ? `${gnd ? 'Missile away' : 'Fox two! Missile away'} at the ${tgt.def.name}` : 'Missile away, no lock', tgt ? 'good' : '');
}
function steerMissile(p, dt) {
  let sp = p.vel.length(); sp = Math.min(p.vmax, sp + 320 * dt);
  const dir = T3.copy(p.vel).normalize();
  if (p.tgt && (p.tgt.dead || p.tgt.team === p.team)) p.tgt = null;
  if (p.tgt) {
    const dist = p.pos.distanceTo(p.tgt.pos), t = p.tgt;
    // a jet turning hard with a missile close behind pops flares, and they often fool the seeker
    TA.copy(t.vel).normalize(); const turnRate = p.lastV ? Math.acos(clamp(TA.dot(p.lastV), -1, 1)) / dt : 0;
    if (!p.lastV) p.lastV = V(); p.lastV.copy(TA);
    if (dist < 320 && turnRate > 0.7 && Math.random() < 1.3 * dt) {
      for (let i = 0; i < 6; i++) { TA.copy(t.pos).add(T2.set(rnd(-4, 4), rnd(-3, 1), rnd(-4, 4))); fx(TA, i % 2 ? 0xfff4c8 : 0xffa040, 1.6, 0.4, 1.3, -10, 1); }
      tellU(t, 'Flares! The missile is fooled.', 'good');
      // the missile chases the flares, falling behind and below the jet, and can no longer hit it
      TA.copy(t.pos).addScaledVector(t.vel, -0.8); TA.y -= 25; dir.copy(TA.sub(p.pos).normalize());
      p.tgt = null; p.ignore = t; p.vel.copy(dir).multiplyScalar(sp); return;
    }
    centerOf(p.tgt, TA).addScaledVector(p.tgt.vel, Math.min(2, dist / sp) * 0.8).sub(p.pos).normalize();
    const ang = Math.acos(clamp(dir.dot(TA), -1, 1)), k = Math.min(1, p.turn * dt / Math.max(ang, 1e-4));
    if (ang > 1.6) p.tgt = null;                 // overshot: the seeker loses the target
    else dir.lerp(TA, k).normalize();
  }
  p.vel.copy(dir).multiplyScalar(sp);
}
function shoot(u, w, aim, xs) {
  const d = u.def, o = T2;
  const nose = d.domain === 'air' && !d.heli;
  if (nose) { fwd(u.yaw, u.pitch, T3); o.copy(u.pos).addScaledVector(T3, d.radius); }
  else {
    const y = Math.atan2(aim.x - u.pos.x, aim.z - u.pos.z), k = d.len ? d.beam * 0.7 : 2.6;
    o.set(u.pos.x + Math.sin(y) * k, u.pos.y + (d.heli ? -0.9 : (d.centerY || 1) + (d.len ? d.beam * 0.6 : 0.8)), u.pos.z + Math.cos(y) * k);
  }
  const dir = V().subVectors(aim, o).normalize();
  if (nose && dir.dot(T3) < 0.93) dir.copy(T3);
  const sp = (w.spread || 0.004) + xs; dir.x += rnd(-sp, sp); dir.y += rnd(-sp, sp); dir.z += rnd(-sp, sp); dir.normalize();
  const p = addProj(w.kind, o, dir.multiplyScalar(w.vel), u, w.dmg, w.splash || 0, w.range / w.vel); if (w.ap) p.ap = 1;
  sfx(w.kind === 'bullet' ? 'gun' : 'shell', u.pos);
  if (w.kind === 'shell') fx(o, 0xffd9a0, 0.8, 3.2, 0.15);
}
function fireGun(u, aim, xs) {
  const g = u.def.gun; if (!g || u.cdGun > 0 || (u.def.sub && u.dive > 0.3)) return;
  u.cdGun = g.rate * World.reload * (u.ctrl ? 1 : 1.6);
  shoot(u, g, aim, xs || 0);
}
function fireAlt(u, aim, lock) {
  const a = u.def.alt; if (!a || u.cdAlt > 0) return false;
  u.cdAlt = a.cd * World.reload;
  if (a.kind === 'launch') { if (!launchWing(u)) u.cdAlt = 4; return true; }
  if (a.kind === 'aam') { fireMissile(u, aim, lock); return true; }
  if (a.kind === 'bomb' || a.kind === 'nuke') { u.bombQ = a.count; u.bombT = 0; }
  else if (a.kind === 'torpedo') {
    let yaw, ox, oz, oy;
    if (u.def.domain === 'air') { yaw = u.yaw; ox = u.pos.x; oz = u.pos.z; oy = u.pos.y - 2; }
    else { yaw = Math.atan2(aim.x - u.pos.x, aim.z - u.pos.z); ox = u.pos.x + Math.sin(yaw) * (u.def.len * 0.5 + 4); oz = u.pos.z + Math.cos(yaw) * (u.def.len * 0.5 + 4); oy = World.water + 1; }
    addProj('torpedo', T2.set(ox, oy, oz), V().set(Math.sin(yaw) * 58, 0, Math.cos(yaw) * 58), u, a.dmg, a.splash, 14);
    sfx('splash', u.pos);
  } else shoot(u, a, aim, 0);
  return true;
}
function centerOf(u, out) { return out.copy(u.pos).setY(u.pos.y + (u.def.centerY || 0)); }
// distance from point to a unit's body (0 when inside)
function distToUnit(u, p) {
  const d = u.def; centerOf(u, TC);
  if (d.len) {
    const fx_ = Math.sin(u.yaw), fz = Math.cos(u.yaw);
    const s = clamp((p.x - TC.x) * fx_ + (p.z - TC.z) * fz, -d.len / 2, d.len / 2);
    TC.x += fx_ * s; TC.z += fz * s;
    const dy = p.y - TC.y; // tall superstructure: forgive height
    return Math.max(0, Math.hypot(p.x - TC.x, p.z - TC.z, dy > 0 ? dy * 0.5 : dy) - d.radius);
  }
  return Math.max(0, p.distanceTo(TC) - d.radius * (d.domain === 'air' ? 1.15 : 1));
}
function hitTest(u, p) {
  const reach = (u.def.len ? u.def.len * 0.5 : u.def.radius) + 30;
  if (Math.abs(p.pos.x - u.pos.x) > reach || Math.abs(p.pos.z - u.pos.z) > reach) return false;
  if (distToUnit(u, p.pos) <= 0) return true;
  T3.lerpVectors(p.prev, p.pos, 0.5); if (distToUnit(u, T3) <= 0) return true;
  return distToUnit(u, p.prev) <= 0;
}
function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.prev.copy(p.pos); p.life -= dt;
    if (p.kind === 'aam') steerMissile(p, dt);
    if (p.kind === 'bomb' || p.kind === 'nuke' || (p.kind === 'torpedo' && !p.swim)) p.vel.y -= 40 * dt;
    p.pos.addScaledVector(p.vel, dt);
    const th = terrainH(p.pos.x, p.pos.z);
    let done = false, hit = null;
    if (p.kind === 'torpedo') {
      if (!p.swim && p.pos.y <= World.water - 0.3) { if (th > World.water - 0.8) done = true; else { p.swim = true; p.vel.y = 0; splashFx(p.pos, 5); } }
      if (p.swim) { p.pos.y = World.water - 0.3; if (th > World.water - 0.8) done = true; }
    } else if (p.pos.y <= Math.max(th, World.water)) { done = true; p.pos.y = Math.max(th, World.water); }
    if (!done && p.tgt && distToUnit(p.tgt, p.pos) < 5) hit = p.tgt;              // proximity fuse
    if (!done && !hit) for (const u of units) {
      if (u.team === p.team || u.dead || u === p.ignore) continue;
      if (p.kind === 'torpedo' && (u.def.domain !== 'sea' || !p.swim)) continue;
      if (u.def.sub && u.dive > 0.5 && p.kind !== 'torpedo') continue;   // submerged: only torpedoes and blast reach it
      if (hitTest(u, p)) { hit = u; break; }
    }
    if (hit || done || p.life <= 0) {
      if (hit || done) impact(p, hit, th);
      projs.splice(i, 1);
    }
  }
}
function nukeBlast(p) {
  const pos = p.pos.clone(), R = p.splash;
  Out.nuke(pos); sfx('nuke', pos);
  fx(pos, 0xffffff, 30, R * 0.9, 1.3, 0, 1); fx(pos, 0xffe08a, 20, R * 0.6, 2.4, 6, 0.95); fx(pos, 0xff7a20, 15, R * 0.42, 3.8, 10, 0.9);
  for (let i = 0; i < 9; i++) { TC.copy(pos); TC.y += i * 22; fx(TC, i > 6 ? 0x6a5a50 : 0x4a4038, 14, i > 6 ? 110 : 38, 9 + i * 0.6, 16, 0.75); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; TC.set(pos.x + Math.sin(a) * R * 0.55, pos.y + 4, pos.z + Math.cos(a) * R * 0.55); fx(TC, 0xd8d0c0, 10, 48, 3.2, 3, 0.5); }
  for (const u of units.slice()) {
    if (u.team === p.team || u.dead) continue;
    const dd = distToUnit(u, pos);
    if (dd < R) damage(u, p.dmg * (1 - dd / R) * (u.def.model === 'hq' ? 0.35 : 1), p.owner, p.pl);
  }
  say(p.team, 'ATOMIC BOMB DETONATED. Everything beneath it is gone.', 'gold');
  say(1 - p.team, `The ${SIDE_PL[p.team]} have dropped an atomic bomb!`, 'bad');
}
function impact(p, hit, th) {
  if (p.kind === 'nuke') { nukeBlast(p); return; }
  const pos = p.pos.clone(), wet = th < World.water;
  if (hit) damage(hit, p.dmg * (p.kind === 'bullet' && hit.def.armor ? (p.ap ? 0.7 : 0.2) : 1), p.owner, p.pl);   // ap: armour-piercing cannon
  if (p.splash) {
    explode(pos, p.splash * 0.8);
    if (wet || p.kind === 'torpedo') splashFx(pos, p.splash * 0.9);
    for (const u of units.slice()) {
      if (u.team === p.team || u === hit || u.dead) continue;
      if (p.kind === 'torpedo' && u.def.domain !== 'sea') continue;
      if (u.def.sub && u.dive > 0.5 && p.kind === 'shell') continue;
      const dd = distToUnit(u, pos);
      if (dd < p.splash) damage(u, p.dmg * 0.6 * (1 - dd / p.splash) * (u.def.domain === 'air' ? 0.3 : 1), p.owner, p.pl);
    }
  } else if (hit) fx(pos, 0xffe9a0, 0.5, 1.8, 0.14);
  else if (wet) { TC.copy(pos); fx(TC, 0xffffff, 0.4, 1.6, 0.35, 4, 0.6); }
  else fx(pos, 0x8a7a5a, 0.4, 1.5, 0.3, 2, 0.5);
}

// -------------------------------------------------------------- damage, defection, death
// pl: the player whose shot it was (null when the computer fired it)
function bountyOf(d) { return d.model === 'hq' ? 2000 : Math.round(Math.max(40, (d.aiCost || d.cost || 300) * 0.3) / 5) * 5; }
function damage(u, amt, att, pl) {
  if (u.dead) return;
  if (u.def.model === 'hq' && !hqOpen(u.team)) {
    if (pl && time - pl.hqMsgT > 8) { pl.hqMsgT = time; tell(pl, `The ${TEAM_NAME[u.team]} headquarters is out of reach until every other point is taken (${hqLeft(u.team)} still to go).`, 'bad'); }
    return;
  }
  if (!pl) amt *= 0.45;            // AI gunnery is weaker than the players': keeps the war from burning out
  if (u.cover > 0.35) amt *= 0.75; // the trees soak up some of it
  u.hp -= amt;
  if (u.ctrl) Out.hurt(u.ctrl);
  if (u.def.domain === 'sea' && !u.ctrl && !u.rolled && u.hp < u.maxHp * 0.25) {
    u.rolled = true;
    if (Math.random() < 0.38) { defect(u, pl); return; }
  }
  if (u.hp <= 0) kill(u, att, pl);
}
function defect(u, pl) {
  const old = u.team; u.team = 1 - old;
  u.hp = Math.max(u.hp, u.maxHp * 0.4); u.target = null; u.aaTarget = null; u.route = null; u.patrol = null;
  TC.copy(u.pos).setY(u.pos.y + 14); fx(TC, 0xffffff, 3, 16, 1.2, 4, 0.7);
  for (const p of teamPlayers(u.team)) p.stats.defect++;
  const bonus = pl && pl.team === u.team ? bountyOf(u.def) : 0; if (bonus) pl.money += bonus;
  say(u.team, `${u.def.name} strikes her colours and DEFECTS to the ${SIDE_PL[u.team]}!${bonus ? ' +$' + bonus : ''}`, 'gold');
  say(old, `Mutiny! ${u.def.name} has defected to the ${SIDE_PL[u.team]}!`, 'bad');
}
function kill(u, att, pl) {
  if (u.dead) return;
  u.dead = true; const i = units.indexOf(u); if (i >= 0) units.splice(i, 1);
  const d = u.def, foe = 1 - u.team;
  explode(centerOf(u, TA), d.len ? d.len * 0.45 : d.radius * 2.4);
  const b = bountyOf(d);
  if (pl && pl.team === foe) { const cr = Math.max(10, Math.round(b * 0.4 / 5) * 5); pl.money += b; pl.stats.kills++; pl.stats.credits += cr; pl.stats.killCr += cr; tell(pl, `Destroyed ${d.name}  +$${b} · +${cr} credits`, 'gold'); }
  else teamAI[foe].budget += b * 0.5;
  if (d.domain === 'bld') say(u.team, `We lost a ${d.name}!`, 'bad');
  Out.killed(u);
  if (d.domain === 'bld') { const pl_ = plots[u.team].find(p => p.unit === u); if (pl_) { pl_.unit = null; pl_.rubble = u.id; } const cp = POINTS.find(p => p.post === u); if (cp) cp.rubble = u.id; }
  if (u.ctrl) { const p = u.ctrl; if (p.unit === u) p.unit = null; Out.died(p, u); tell(p, 'Your vehicle was destroyed.', 'bad'); }
  if (d.model === 'hq') endBattle(foe);
}

// -------------------------------------------------------------- AI
function weight(d, e) {
  const ed = e.def.domain;
  switch (d.role) {
    case 'fighter': return ed === 'air' ? 3 : ed === 'land' ? (e.def.armor ? 0.5 : 1.2) : ed === 'sea' ? 0.25 : 0.15;
    case 'bomber': return ed === 'bld' ? 3 : ed === 'sea' ? 2 : ed === 'land' ? 1 : 0;
    case 'torpedo': return ed === 'sea' ? 1 : 0;
    case 'aa': return ed === 'air' ? 3 : ed === 'land' ? 1 : ed === 'bld' ? 0.6 : 0;
    case 'infantry': case 'tank': return ed === 'land' ? 2 : ed === 'bld' ? 1.5 : ed === 'sea' ? 0.4 : 0;
    case 'warship': case 'carrier': return ed === 'sea' ? 2 : ed === 'land' ? 1 : ed === 'bld' ? 1 : 0;
    case 'heli': return ed === 'land' ? 2.5 : ed === 'bld' ? 1 : ed === 'sea' ? 0.8 : 0.4;
    case 'sub': return ed === 'sea' ? 2 : 0;
  }
  return 0;
}
function pickTarget(u) {
  const d = u.def; if (!d.gun && !d.alt) { u.target = null; return; }
  const far = d.role === 'bomber' || d.role === 'torpedo';
  const sight = far ? 99999 : (d.domain === 'air' ? 1300 : d.domain === 'sea' ? 950 : Math.max(520, d.gun ? d.gun.range : 0)) * World.vis;
  let best = null, bs = 1e9;
  for (const e of units) {
    if (e.team === u.team) continue;
    let w = weight(d, e); if (w <= 0) continue;
    if (e.def.model === 'hq' && !hqOpen(e.team)) continue;
    const dist = u.pos.distanceTo(e.pos); if (dist > spotR(e, sight)) continue;
    if (e.def.sub && e.dive > 0.5 && (!(d.asw || d.sub || d.role === 'torpedo') || dist > 450)) continue;   // only sonar finds a dived sub
    if (d.sub && NONCOMBAT[e.def.role]) w *= 2;
    const ed = e.def.domain;
    if (d.domain === 'land' && ed === 'sea' && dist > d.gun.range) continue;
    if (d.domain === 'sea' && (ed === 'land' || ed === 'bld') && dist > d.gun.range + 120) continue;
    const s = dist / w; if (s < bs) { bs = s; best = e; }
  }
  u.target = best;
}
function pickAA(u) {
  const r = u.def.aa.range * Math.max(World.vis, 0.5); let best = null, bd = r;
  for (const e of units) { if (e.team === u.team || e.def.domain !== 'air') continue; const dd = u.pos.distanceTo(e.pos); if (dd < bd && dd < spotR(e, r)) { bd = dd; best = e; } }
  u.aaTarget = best;
}
function autoAA(u, dt) {
  u.aaT -= dt; if (u.aaT <= 0) { u.aaT = 0.5; pickAA(u); }
  const t = u.aaTarget; if (!t || t.dead || t.team === u.team) { u.aaTarget = null; return; }
  const a = u.def.aa, dist = u.pos.distanceTo(t.pos);
  if (u.def.domain === 'bld') u.aimYaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
  if (u.cdAA > 0 || dist > a.range) return;
  u.cdAA = a.rate * World.reload;
  const o = TB.copy(u.pos); o.y += (u.def.centerY || 2) + (u.def.len ? u.def.beam * 0.7 : 2);
  if (u.def.domain === 'air') o.y = u.pos.y + 2;
  const vel = 620, tt = dist / vel;
  const dir = V().copy(t.pos).addScaledVector(t.vel, tt).sub(o).normalize();
  const sp = 0.035; dir.x += rnd(-sp, sp); dir.y += rnd(-sp, sp); dir.z += rnd(-sp, sp); dir.normalize();
  addProj('bullet', o, dir.multiplyScalar(vel), u, a.dmg, 0, a.range * 1.2 / vel);
  if (Math.random() < 0.3) sfx('gun', u.pos);
}
function setBreak(u, t, dist, alt, jink) {
  u.breakT = t; const y = u.yaw + (jink ? rnd(-1.1, 1.1) : rnd(-0.3, 0.3));
  u.breakPt.set(u.pos.x + Math.sin(y) * dist, alt, u.pos.z + Math.cos(y) * dist);
}
function patrolPoint(u) {
  const d = u.def, cx = v => clamp(v, -MAP.x * 0.95, MAP.x * 0.95), cz = v => clamp(v, -MAP.z * 0.95, MAP.z * 0.95);
  if (d.role === 'torpedo') { const f = frontPos(SEA_LANE); return V().set(cx(f.x + rnd(-900, 900)), 100, cz(f.z + rnd(-700, 700))); }
  const lane = Math.floor(Math.random() * LANES);
  if (d.role === 'bomber') { const sp = stage(u.team, lane); return V().set(sp.x + rnd(-300, 300), 190, sp.z + rnd(-300, 300)); }
  const f = frontPos(lane), x = cx(f.x + rnd(-700, 700)), z = cz(f.z + rnd(-600, 600));
  return V().set(x, ground(x, z) + rnd(110, 200), z);
}
function aiAir(u, dt) {
  const d = u.def, t = u.target, g = T1, sy = Math.sin(u.yaw), cy = Math.cos(u.yaw);
  // look ahead along the flight path too, so the computer's pilots climb over mountains instead of into them
  const gr = Math.max(ground(u.pos.x, u.pos.z), ground(u.pos.x + sy * 160, u.pos.z + cy * 160), ground(u.pos.x + sy * 360, u.pos.z + cy * 360));
  if (d.role === 'cargo') {            // supply run: airport <-> far rear depot
    if (!u.route) {
      const ap = AIRPORT[u.team], dp = HOME[u.team].airDepot;
      u.route = { i: 1, loaded: false, pts: [V().set(ap.x, 80, ap.z), V().set(dp.x + rnd(-200, 200), 210, dp.z + rnd(-200, 200))] };
    }
    const r = u.route, p = r.pts[r.i]; g.copy(p);
    if (hdist(u.pos, p) < 90) { if (r.i === 0 && r.loaded) { deliver(u); r.loaded = false; } if (r.i === 1) r.loaded = true; r.i = 1 - r.i; }
  } else if (d.role === 'airlift') {
    if (u.cargo) { g.copy(u.dropPt); if (hdist(u.pos, u.dropPt) < 70) paradrop(u); }
    else { g.copy(u.exitPt); if (hdist(u.pos, u.exitPt) < 220) { despawn(u); return; } }
  }
  else if (u.breakT > 0) { u.breakT -= dt; g.copy(u.breakPt); }
  else if (!t || (d.role === 'torpedo' && u.cdAlt > 0)) {
    if (!u.patrol || hdist(u.pos, u.patrol) < 160) u.patrol = patrolPoint(u);
    g.copy(u.patrol);
  } else {
    const hd = hdist(u.pos, t.pos), al = Math.abs(angDiff(Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z), u.yaw));
    if (d.role === 'bomber') {
      const alt = Math.max(gr, t.pos.y) + (d.model === 'b52' ? 240 : 170);
      g.set(t.pos.x, alt, t.pos.z);
      const tf = Math.sqrt(Math.max(0, 2 * (u.pos.y - t.pos.y) / 40)), lead = u.speed * tf;
      if (u.cdAlt <= 0 && al < 0.25 && hd < lead + d.alt.count * 5 && hd > lead - 30) fireAlt(u, t.pos);
      if (hd < 40 || (hd < 260 && al > 1)) setBreak(u, 8, 1000, alt);
    } else if (d.role === 'torpedo') {
      g.set(t.pos.x, World.water + (hd > 650 ? 90 : 20), t.pos.z);
      if (hd < 340 && al < 0.15 && u.pos.y < World.water + 60) { fireAlt(u, t.pos); setBreak(u, 5, 800, World.water + 120, true); }
      else if (hd < 200) setBreak(u, 6, 900, World.water + 110);
    } else {
      const dist = u.pos.distanceTo(t.pos), air = t.def.domain === 'air';
      g.copy(t.pos).addScaledVector(t.vel, dist / d.gun.vel); g.y += t.def.centerY || 0;
      T2.subVectors(g, u.pos).normalize(); fwd(u.yaw, u.pitch, TA);
      const dot = T2.dot(TA);
      if (dist < d.gun.range && dot > 0.995) fireGun(u, g, 0.02);
      if (air && d.alt && d.alt.kind === 'aam' && u.cdAlt <= 0 && dist > 140 && dist < d.alt.range * 0.7 && dot > 0.9) fireAlt(u, t.pos);
      if (dist < (air ? 50 : 150) || (!air && dist < 260 && dot < 0.4)) setBreak(u, air ? 1.6 : 4.5, 550, gr + 150, true);
    }
  }
  u.steer.subVectors(g, u.pos).normalize();
  if (u.pos.y - gr < 40) { u.steer.y = Math.max(u.steer.y, 0.5); u.steer.normalize(); }
}
function aiHeli(u, dt) {
  const d = u.def, t = u.target; let gx, gz, gy;
  if (t) {
    const a = Math.atan2(u.pos.x - t.pos.x, u.pos.z - t.pos.z) + 0.3 * (u.id % 2 ? 1 : -1);   // hold a stand-off orbit
    gx = t.pos.x + Math.sin(a) * 230; gz = t.pos.z + Math.cos(a) * 230;
    gy = Math.max(ground(u.pos.x, u.pos.z), t.pos.y) + (t.def.domain === 'air' ? 8 : 55);
    const d3 = u.pos.distanceTo(t.pos); centerOf(t, TA).addScaledVector(t.vel, d3 / d.gun.vel);
    u.aimYaw = Math.atan2(TA.x - u.pos.x, TA.z - u.pos.z);
    if (d3 < d.gun.range) fireGun(u, TA, 0.02);
    if (u.cdAlt <= 0 && d3 < d.alt.range && t.def.domain !== 'air') fireAlt(u, TA);
  } else {
    if (!u.patrol || hdist(u.pos, u.patrol) < 120) u.patrol = patrolPoint(u);
    gx = u.patrol.x; gz = u.patrol.z; gy = ground(u.pos.x, u.pos.z) + 70; u.aimYaw = Math.atan2(gx - u.pos.x, gz - u.pos.z);
  }
  T1.set(gx - u.pos.x, 0, gz - u.pos.z); const l = T1.length();
  if (l > 1) T1.multiplyScalar(Math.min(d.speed, l * 0.8) / l);
  u.hv.set(T1.x, clamp((gy - u.pos.y) * 0.8, -d.speed * 0.4, d.speed * 0.5), T1.z);
}
// Island warfare: when a ground unit's goal lies across the water it cannot drive there. It takes any point on
// its own island that is still open to it, otherwise it holds the nearest friendly point. Idle garrisons far
// behind the front are shipped out after a while (refunded to their commander) so they don't clog the force limit.
function garrison(u, dt, jx, jz, gx, gz) {
  u.hold = null;
  const here = islandOf(u.pos.x, u.pos.z);
  if (here < 0 || here === islandOf(gx, gz)) { u.idle = 0; return true; }
  let best = null, bd = 1e9, own = null, od = 1e9;
  for (const p of POINTS) {
    if (p.sea || p.isl !== here) continue;
    const dd = Math.hypot(p.x - u.pos.x, p.z - u.pos.z);
    if (p.owner !== u.team && canCap(p, u.team) && dd < bd) { bd = dd; best = p; }
    if (p.owner === u.team && dd < od) { od = dd; own = p; }
  }
  if (best) { u.lane = best.eng ? ENG_LANE : best.lane; u.hold = { x: best.x + jx, z: best.z + jz, stop: 20 }; u.idle = 0; return true; }
  const p = own || { x: u.pos.x, z: u.pos.z };
  u.hold = { x: p.x + jx * 2, z: p.z + jz * 2, stop: 40 };
  u.idle = u.target ? 0 : (u.idle || 0) + dt;
  if (u.idle > 90 && !u.mine) {
    const sp = stage(u.team, u.lane === ENG_LANE ? 1 : u.lane), front = islandOf(sp.x, sp.z) === here;
    let mates = 0; for (const v of units) if (v.team === u.team && v.def.domain === 'land' && v.idle > 30) mates++;
    if (!front || mates > 8) { teamAI[u.team].budget += (u.def.aiCost || u.def.cost) * 0.5; despawn(u); return false; }
    u.idle = 60;
  }
  return true;
}
function aiLand(u, dt) {
  const d = u.def, t = u.target; let gx, gz, stop;
  if (t) { gx = t.pos.x; gz = t.pos.z; stop = d.gun.range * 0.7; }
  else if (d.role === 'cargo') {       // supply truck: base <-> depot up the road
    if (!u.route) {
      const b = BASE[u.team], s = FACE[u.team], dp = HOME[u.team].depot;
      u.route = { i: 1, loaded: false, pts: [{ x: b.x + s * 170, z: b.z + rnd(-60, 60) }, { x: dp.x + rnd(-60, 60), z: dp.z + rnd(-60, 60) }] };
    }
    const r = u.route, p = r.pts[r.i]; gx = p.x; gz = p.z; stop = 0;
    if (Math.hypot(gx - u.pos.x, gz - u.pos.z) < 35) { if (r.i === 0 && r.loaded) { deliver(u); r.loaded = false; } if (r.i === 1) r.loaded = true; r.i = 1 - r.i; }
  }
  else {                               // advance on this lane's objective and hold it
    if (u.lane === undefined) { let bd = 1e9; for (const p of POINTS) if (!p.sea) { const dd = Math.hypot(p.x - u.pos.x, p.z - u.pos.z); if (dd < bd) { bd = dd; u.lane = p.lane; } } }
    const jx = (u.id % 5 - 2) * 30, jz = ((u.id >> 2) % 5 - 2) * 30, eng = u.lane === ENG_LANE;
    const o = eng ? engObjective(u.team) : reach(u.team, u.lane);
    if (o) { gx = o.x + jx; gz = o.z + jz; stop = 20; }
    else if (eng && u.team === ALLY) { const p = ENG[ENG.length - 1]; gx = p.x + jx * 2; gz = p.z + jz * 2; stop = 30; }   // the homeland is secure: stand guard at the beach
    else if (eng) { const b = BASE[ALLY]; gx = b.x; gz = b.z + jx; stop = 60; }                                   // the homeland has fallen: on to the Allied headquarters
    else if (u.team === ALLY) { const b = BASE[AXIS]; gx = b.x; gz = b.z + jx; stop = 60; }      // lane won: on to the Axis capital
    else { const p = PT(0, u.lane); gx = p.x + jx; gz = p.z + jz; stop = 40; }                   // the Axis cannot cross the water: dig in on the coast
    if (TH.islands) {
      if (!garrison(u, dt, jx, jz, gx, gz)) return;
      if (u.hold) { gx = u.hold.x; gz = u.hold.z; stop = u.hold.stop; }
    }
  }
  const dist = Math.hypot(gx - u.pos.x, gz - u.pos.z);
  navTo(u.pos.x, u.pos.z, gx, gz, false, NV);
  let want = Math.atan2(NV.x - u.pos.x, NV.z - u.pos.z);
  if (sdf(u.pos.x + Math.sin(u.yaw) * 25, u.pos.z + Math.cos(u.yaw) * 25) < 12) {   // water ahead: turn inland and along the shore toward the goal
    const g = sdGrad(u.pos.x, u.pos.z); let tx = -g[1], tz = g[0]; if (tx * (gx - u.pos.x) + tz * (gz - u.pos.z) < 0) { tx = -tx; tz = -tz; }
    want = Math.atan2(g[0] + tx * 0.8, g[1] + tz * 0.8);
  }
  const dy = angDiff(want, u.yaw);
  u.turnIn = clamp(dy * 2, -1, 1);
  u.throttle = dist > stop ? (Math.abs(dy) < 1 ? 1 : 0.3) : 0;
  if (t) {
    const d3 = u.pos.distanceTo(t.pos);
    centerOf(t, TA).addScaledVector(t.vel, d3 / d.gun.vel);
    u.aimYaw = Math.atan2(TA.x - u.pos.x, TA.z - u.pos.z);
    if (d3 < d.gun.range) fireGun(u, TA, 0.02);
    if (d.alt && d.alt.kind !== 'aam' && u.cdAlt <= 0 && d3 < d.alt.range && t.def.armor) fireAlt(u, TA);
  } else u.aimYaw = u.yaw;
  if (d.alt && d.alt.kind === 'aam' && u.cdAlt <= 0) {     // SAM launcher: fires on any aircraft in range, even while its gun is busy
    let air = t && t.def.domain === 'air' ? t : null;
    if (!air) { let bd = d.alt.range * 0.8 * World.vis; for (const e of units) if (e.team !== u.team && !e.dead && e.def.domain === 'air') { const dd = u.pos.distanceTo(e.pos); if (dd < bd && dd < spotR(e, d.alt.range * 0.8 * World.vis)) { bd = dd; air = e; } } }
    if (air) { const dd = u.pos.distanceTo(air.pos); if (dd > 100 && dd < d.alt.range * 0.8 * World.vis) fireAlt(u, air.pos, air); }
  }
}
function dockOf(team) { for (const u of units) if (u.def.model === 'dock' && u.team === team) return u; return null; }
function aiSea(u, dt) {
  const d = u.def, t = u.target; let gx, gz, thr = 1, direct = false;
  if (d.role === 'carrier' && u.cdAlt <= 0 && !u.ctrl) fireAlt(u, u.pos);
  if (d.role === 'merchant') {
    if (!u.route) {
      const H = HOME[u.team];
      u.route = { i: 1, loaded: false, pts: [{ x: H.port.x + rnd(-40, 40), z: H.port.z + rnd(-40, 40) }, { x: H.seaFar.x + rnd(-200, 200), z: H.seaFar.z + rnd(-150, 150) }] };
    }
    const r = u.route, p = r.pts[r.i]; gx = p.x; gz = p.z;
    if (Math.hypot(gx - u.pos.x, gz - u.pos.z) < 60) {
      if (r.i === 0 && r.loaded) { deliver(u); r.loaded = false; }
      if (r.i === 1) r.loaded = true;
      r.i = 1 - r.i;
    }
  } else if (d.role === 'lander') {    // run in to the beach, unload, sail back out
    if (u.cargo) {
      gx = u.beach.x; gz = u.beach.z; const dd = Math.hypot(gx - u.pos.x, gz - u.pos.z); direct = dd < 500;
      if (dd < 40 || (u.aground && dd < 180)) unload(u);
    } else { gx = u.exit.x; gz = u.exit.z; if (Math.hypot(gx - u.pos.x, gz - u.pos.z) < 100) { despawn(u); return; } }
  } else if (t) {
    const dist = u.pos.distanceTo(t.pos), deep = t.def.sub && t.dive > 0.5;
    if (d.sub) u.diveT = 1;
    if (deep || dist > d.gun.range * 0.7 || (d.sub && dist > 330)) { gx = t.pos.x; gz = t.pos.z; }
    else { const b = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z) + Math.PI / 2 * (u.id % 2 ? 1 : -1); gx = u.pos.x + Math.sin(b) * 200; gz = u.pos.z + Math.cos(b) * 200; thr = 0.55; direct = true; }
    centerOf(t, TA).addScaledVector(t.vel, dist / d.gun.vel);
    u.aimYaw = Math.atan2(TA.x - u.pos.x, TA.z - u.pos.z);
    if (dist < d.gun.range && !deep) fireGun(u, TA, 0.015);
    if (d.alt && d.alt.kind === 'torpedo' && u.cdAlt <= 0 && t.def.domain === 'sea' && dist < 430) { TB.copy(t.pos).addScaledVector(t.vel, dist / 58 * 0.8); fireAlt(u, TB); }
  } else {
    if (d.sub) u.diveT = 0;
    if (!u.patrol || hdist(u.pos, u.patrol) < 90) {   // hold the contested sea point; with the sea lane won, blockade the enemy port
      const o = reach(u.team, SEA_LANE) || homeSpot(1 - u.team, SEA_LANE), q = seaSpot(o.x, o.z, 0, 260);
      u.patrol = V().set(q[0], 0, q[1]);
    }
    gx = u.patrol.x; gz = u.patrol.z; u.aimYaw = u.yaw;
  }
  if (direct) { NV.x = gx; NV.z = gz; } else navTo(u.pos.x, u.pos.z, gx, gz, true, NV);
  let want = Math.atan2(NV.x - u.pos.x, NV.z - u.pos.z);
  const sy = Math.sin(u.yaw), cy = Math.cos(u.yaw);
  if (!(d.role === 'lander' && u.cargo) && (sdf(u.pos.x + sy * 45, u.pos.z + cy * 45) > -60 || sdf(u.pos.x + sy * 100, u.pos.z + cy * 100) > -60)) {
    // shallows ahead: turn out to sea and along the shore toward the goal
    const g = sdGrad(u.pos.x, u.pos.z); let tx = -g[1], tz = g[0]; if (tx * (gx - u.pos.x) + tz * (gz - u.pos.z) < 0) { tx = -tx; tz = -tz; }
    want = Math.atan2(-g[0] + tx * 0.7, -g[1] + tz * 0.7);
  }
  for (const b of World.icebergs) {
    if (b.k < 0.3) continue;
    const dx = b.x - u.pos.x, dz = b.z - u.pos.z, dd = Math.hypot(dx, dz);
    if (dd < b.r + d.len * 0.5 + 75) { const rel = angDiff(Math.atan2(dx, dz), u.yaw); if (Math.abs(rel) < 1.0) { want = u.yaw - (rel >= 0 ? 1 : -1) * 1.3; break; } }
  }
  const dy = angDiff(want, u.yaw);
  u.turnIn = clamp(dy * 2, -1, 1); u.throttle = thr * (Math.abs(dy) > 1.5 ? 0.5 : 1);
}
// a supply run pays the side's players; a side with no players puts it toward the computer's next reinforcements
function deliver(u) {
  const pay = u.def.pay || 100, pls = teamPlayers(u.team);
  if (pls.length) { for (const p of pls) p.money += pay; say(u.team, `${u.def.name} delivered cargo  +$${pay}`, 'good'); }
  else teamAI[u.team].budget += pay * 0.6;
}
// destroyers, cruisers and torpedo boats roll depth charges onto any dived submarine close by
function aswAuto(u, dt) {
  u.cdDC -= dt; if (u.cdDC > 0) return; u.cdDC = 0.4;
  for (const e of units) {
    if (e.team === u.team || !e.def.sub || e.dive < 0.3) continue;
    const dx = e.pos.x - u.pos.x, dz = e.pos.z - u.pos.z; if (Math.hypot(dx, dz) > 150) continue;
    u.cdDC = 2.2 * World.reload; const t = 1.3;
    T2.copy(u.pos); T2.y += 4;
    addProj('bomb', T2, V().set((dx + e.vel.x * t) / t + rnd(-6, 6), 22, (dz + e.vel.z * t) / t + rnd(-6, 6)), u, 170, 30, 8);
    return;
  }
}

// -------------------------------------------------------------- per-unit update
function updateUnit(u, dt) {
  if (u.dead) return;
  const d = u.def; u.cdGun -= dt; u.cdAlt -= dt; u.cdAA -= dt; u.prev.copy(u.pos);
  if (d.domain === 'bld') {
    if (u.built < 1) { u.built = Math.min(1, u.built + dt / 8); if (u.built >= 1) say(u.team, `${d.name} is operational`, 'good'); }
  } else {
    if (!u.ctrl) {
      u.thinkT -= dt; if (u.thinkT <= 0) { u.thinkT = rnd(0.6, 1); pickTarget(u); }
      if (u.target && (u.target.dead || u.target.team === u.team)) u.target = null;
      u.throttleT = 1;
      (d.heli ? aiHeli : d.domain === 'air' ? aiAir : d.domain === 'land' ? aiLand : aiSea)(u, dt);
      if (u.dead) return;
    }
    (d.heli ? moveHeli : d.domain === 'air' ? moveAir : d.domain === 'land' ? moveLand : moveSea)(u, dt);
    if (u.dead) return;
    if (d.asw) aswAuto(u, dt);
    u.vel.subVectors(u.pos, u.prev).divideScalar(dt);
  }
  if (d.aa && u.built >= 1) autoAA(u, dt);
  if (u.bombQ > 0) {
    u.bombT -= dt;
    if (u.bombT <= 0) { u.bombT = 0.09; u.bombQ--; const a = d.alt; T2.copy(u.pos); T2.y -= 2.5; addProj(a.kind, T2, u.vel.clone().multiplyScalar(0.97), u, a.dmg, a.splash, 30); }
  }
}
function sepR(u) { return u.def.len ? u.def.len * 0.36 : u.def.radius; }
function separation() {
  for (let i = 0; i < units.length; i++) {
    const a = units[i], da = a.def.domain; if (da === 'air') continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j], db = b.def.domain; if (db === 'air' || (da === 'bld' && db === 'bld')) continue;
      if (da !== db && !((da === 'bld' && db === 'land') || (da === 'land' && db === 'bld'))) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, r = sepR(a) + sepR(b), dd = dx * dx + dz * dz;
      if (dd >= r * r || dd < 0.0001) continue;
      const dist = Math.sqrt(dd), push = (r - dist) * 0.5, nx = dx / dist, nz = dz / dist;
      const ka = da === 'bld' ? 0 : db === 'bld' ? 2 : 1, kb = db === 'bld' ? 0 : da === 'bld' ? 2 : 1;
      a.pos.x -= nx * push * ka; a.pos.z -= nz * push * ka; b.pos.x += nx * push * kb; b.pos.z += nz * push * kb;
    }
  }
}
function icebergHits(dt) {
  for (const b of World.icebergs) {
    if (b.k < 0.4) continue;
    for (const u of units) {
      if (u.def.domain !== 'sea') continue;
      const dx = u.pos.x - b.x, dz = u.pos.z - b.z, dd = Math.hypot(dx, dz), r = b.r * 0.9 + u.def.beam;
      if (dd < r) {
        u.pos.x += dx / dd * (r - dd); u.pos.z += dz / dd * (r - dd); u.speed *= 0.6;
        if (u.ctrl && time - (u.iceMsg || 0) > 4) { u.iceMsg = time; tell(u.ctrl, 'ICEBERG! The hull is taking damage.', 'bad'); sfx('boom', u.pos); }
        damage(u, 160 * dt + Math.abs(u.speed) * 0.9, null, null);
        if (u.dead) break;
      }
    }
  }
}

// -------------------------------------------------------------- economy & commanders
function incomeOf(team) { let s = 0; for (const u of units) if (u.team === team && u.def.domain === 'bld' && u.built >= 1) s += u.def.people * u.def.perHead; return s; }
function build(team, id, instant) {
  const p = plots[team].find(p => !p.unit); if (!p) return null;
  if (p.rubble) { Out.clearWreck(p.rubble); p.rubble = null; }
  p.unit = spawn(id, team, p.x, p.z, { build: !instant, yaw: 0 }); return p.unit;
}
function commander(team, dt) {
  const ai = teamAI[team];
  let own = 0, foe = 0;
  for (const u of units) if (u.def.domain !== 'bld') { if (u.team === team) own++; else foe++; }
  // the losing side gets reinforcements faster, so the front line keeps moving both ways
  ai.budget += dt * (9 + incomeOf(team) / INCOME_PERIOD * (team === AXIS ? 1 : 0.5)) * clamp((foe + 4) / (own + 4), 0.8, 2.2);
  ai.timer -= dt; if (ai.timer > 0) return; ai.timer = rnd(4, 8);
  if (team === AXIS && Math.random() < 0.22) {
    const id = ['house', 'factory', 'aagun'][Math.floor(Math.random() * 3)];
    if (ai.budget >= DEFS[id].cost + 200 && build(team, id)) ai.budget -= DEFS[id].cost;
    return;
  }
  let mobile = 0;
  for (const u of units) if (u.team === team && u.def.domain !== 'bld') mobile++;
  if (mobile >= UNIT_CAP) return;
  const list = ROSTER[team].filter(i => has(i)), id = list[Math.floor(Math.random() * list.length)], d = DEFS[id], c = d.aiCost || d.cost;
  if (d.max && units.filter(u => u.team === team && u.def === d).length >= d.max) return;
  if (c <= ai.budget) { ai.budget -= c; requisition(id, team); }
}
function raids(dt) {
  raidT -= dt; if (raidT > 0) return; raidT = rnd(26, 44);
  const team = Math.random() < 0.5 ? ALLY : AXIS, cx = v => clamp(v, -MAP.x - 100, MAP.x + 100), cz = v => clamp(v, -MAP.z - 100, MAP.z + 100);
  const bid = team === ALLY ? 'b25' : 'ju88', tid = team === ALLY ? 'avenger' : 'fi167';
  if (Math.random() < 0.45 && has(bid)) {          // level-bomber formation crossing the front from its own rear
    const lane = Math.random() < 0.5 ? 0 : 1, sp = stage(team, lane), bv = behind(team, sp.lane, sp.col), f = frontPos(lane), yaw = Math.atan2(-bv[0], -bv[1]);
    for (let i = 0; i < 3; i++) spawn(bid, team, cx(f.x + bv[0] * (2300 + i * 45) - bv[1] * (i - 1) * 55), cz(f.z + bv[1] * (2300 + i * 45) + bv[0] * (i - 1) * 55), { alt: 210, raid: true, yaw });
    say(team, `${TEAM_NAME[team]} bomber formation crossing the front!`, 'good');
    say(1 - team, `WARNING: ${TEAM_NAME[team]} bomber formation inbound!`, 'bad');
    return;
  }
  if (!has(tid) || !units.some(u => u.team !== team && u.def.domain === 'sea')) return;
  const sp = stage(team, SEA_LANE), bv = behind(team, sp.lane, sp.col), f = frontPos(SEA_LANE), r = rnd(1100, 1700), n = 2 + (Math.random() < 0.4 ? 1 : 0);
  for (let i = 0; i < n; i++) spawn(tid, team, cx(f.x + bv[0] * r - bv[1] * i * 40), cz(f.z + bv[1] * r + bv[0] * i * 40), { alt: 110, yaw: Math.atan2(-bv[0], -bv[1]), raid: true });
  say(team, `${TEAM_NAME[team]} torpedo bombers inbound over the sea!`, 'good');
  say(1 - team, `WARNING: ${TEAM_NAME[team]} torpedo bombers hunting our ships!`, 'bad');
}
// ---- capture points: destroy the command post, then hold the ground (or the water) to take the point
function setOwner(p, team) {
  p.owner = team; p.prog = 0;
  for (const u of units) u.patrol = null;
  frontVer++;
}
function setupPoints() {
  for (const p of POINTS) {
    p.isl = islandOf(p.x, p.z);
    p.y = p.sea ? 0 : terrainH(p.x, p.z);
    if (p.owner >= 0) p.post = spawn(p.sea ? 'seafort' : 'outpost', p.owner, p.x, p.z, { yaw: 0 });
  }
  startOwned = [ownedBy(ALLY), ownedBy(AXIS)]; frontVer++;
}
// byPl: the player who led the capture, if any
function capture(p, team, byPl) {
  if (p.rubble) { Out.clearWreck(p.rubble); p.rubble = null; }
  setOwner(p, team);
  p.post = spawn(p.sea ? 'seafort' : 'outpost', team, p.x, p.z, { build: true, yaw: 0 });
  const paid = byPl && byPl.team === team;
  for (const pl of teamPlayers(team)) pl.stats.caps++;
  if (paid) { byPl.stats.credits += 250; byPl.stats.capCr += 250; byPl.money += 400; }
  const engSub = team === ALLY ? 'The invaders are pushed back toward the sea' : `The invasion of ${HOME_NAME} advances`;
  Out.banner(team, p.name + (p.eng && team === ALLY ? ' retaken' : ' captured'), p.eng ? engSub : TH.str.advance);
  say(team, `${p.name} is ours!` + (paid ? '  +$400 · +250 credits' : ''), 'gold');
  Out.banner(1 - team, p.name + ' lost', p.eng ? engSub : TH.str.retreat);
  say(1 - team, `The ${SIDE_PL[team]} have taken ${p.name}!`, 'bad');
}
function updatePoints(dt) {
  capT -= dt; if (capT > 0) return; capT = 0.5;
  for (const p of POINTS) {
    if (p.post && p.post.dead) {
      const old = p.owner; p.post = null; setOwner(p, -1);
      say(1 - old, `${p.name}: ${TEAM_NAME[old]} command post destroyed. Move in and hold it!`, 'good');
      say(old, `${p.name}: our command post has fallen! Hold the ground or lose the sector.`, 'bad');
    }
    p.contest = false;
    if (p.post) continue;
    const R = p.sea ? CAP_R_SEA : CAP_R, n = [0, 0], pc = [null, null];
    for (const u of units) {
      const d = u.def;
      if (p.sea ? (d.domain !== 'sea' || NONCOMBAT[d.role] || (d.sub && u.dive > 0.5)) : (d.domain !== 'land' || d.role === 'cargo' || u.chute > 0)) continue;
      if (Math.abs(u.pos.x - p.x) > R || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > R) continue;
      n[u.team]++; if (u.ctrl) pc[u.team] = u.ctrl;
    }
    p.contest = n[0] > 0 && n[1] > 0;
    const step = 0.5 / 28;             // one unit takes 28 s; three or more take about 9 s
    if (n[0] && !n[1] && canCap(p, ALLY)) { p.prog += step * Math.min(n[0], 3); if (pc[0]) p.plCap = pc[0]; }
    else if (n[1] && !n[0] && canCap(p, AXIS)) { p.prog -= step * Math.min(n[1], 3); if (pc[1]) p.plCap = pc[1]; }
    else if (!n[0] && !n[1]) p.prog -= Math.sign(p.prog) * Math.min(Math.abs(p.prog), step * 0.5);
    if (p.prog >= 1) { capture(p, ALLY, p.plCap); p.plCap = null; }
    else if (p.prog <= -1) { capture(p, AXIS, p.plCap); p.plCap = null; }
  }
}
const GRIPES = [
  'Sailor: "My socks are wet. Again."', 'Gunner: "Can\'t see a thing through this rain, sir."', 'Loader: "Shells keep slipping out of my hands!"',
  'Deckhand: "Permission to complain about the weather, sir?"', 'Gunner: "The breech is flooded. Give me a minute."', 'Cook: "The soup is 40% rainwater now."',
  'Private: "I joined the army to get OUT of the rain."', 'Helmsman: "Wipers. Somebody invent wipers."'
];
// every few seconds each side's buildings pay its players
function economy(dt) {
  incomeT -= dt;
  if (incomeT <= 0) { incomeT = INCOME_PERIOD; const inc = [incomeOf(ALLY), incomeOf(AXIS)]; for (const p of players) p.money += inc[p.team]; }
  if (World.info.rain) { crewT -= dt; if (crewT <= 0) { crewT = rnd(9, 15); say(-1, GRIPES[Math.floor(Math.random() * GRIPES.length)], 'crew'); } }
}

// -------------------------------------------------------------- what players do
// pl.ctl is filled in by the player's screen (or arrives over the network) before each step:
// w/s/a/d/e/q and fire/alt are held buttons, yaw is the camera heading, aimDir/aimPoint where they aim,
// lock the enemy aircraft in their missile seeker.
function setControl(pl, u) {
  if (pl.unit && pl.unit.ctrl === pl) pl.unit.ctrl = null;
  pl.unit = u; u.ctrl = pl;
  u.hv.set(0, 0, 0); u.target = null; u.breakT = 0; u.throttleT = 1; u.cdGun = 0; u.cdAlt = Math.min(u.cdAlt, 1);
  Out.control(pl, u);
}
function controlUnit(pl, dt) {
  const u = pl.unit; if (!u || u.dead) return;
  const d = u.def, c = pl.ctl;
  if (d.heli) {                        // forward-back, strafe, climb-descend; the nose follows the camera
    const f = (c.w ? 1 : 0) - (c.s ? 1 : 0), st = (c.a ? 1 : 0) - (c.d ? 1 : 0), up = (c.e ? 1 : 0) - (c.q ? 1 : 0);
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    u.hv.set((sy * f + cy * st) * d.speed, up * d.speed * 0.5, (cy * f - sy * st) * d.speed); u.aimYaw = c.yaw;
  } else if (d.domain === 'air') {
    u.steer.copy(c.aimDir);
    if (c.w) u.throttleT = Math.min(1.2, u.throttleT + dt * 0.5);
    if (c.s) u.throttleT = Math.max(0.55, u.throttleT - dt * 0.5);
  } else {
    u.throttle = (c.w ? 1 : 0) - (c.s ? 1 : 0); u.turnIn = (c.a ? 1 : 0) - (c.d ? 1 : 0);
    u.aimYaw = Math.atan2(c.aimPoint.x - u.pos.x, c.aimPoint.z - u.pos.z);
  }
  if (c.fire) fireGun(u, c.aimPoint, 0);
  if (c.alt) fireAlt(u, c.aimPoint);
}
function plHas(pl, id) { return tierOk(id, pl.tiers) && sideOk(id, pl.team); }
// a vehicle a side may field: its own (buildings belong to nobody)
function sideOk(id, team) { const d = DEFS[id]; return !!d && (d.team === undefined || d.team === team); }
// the same kind of vehicle for the other side: the shop lists name the Allied ones; the Axis version is the mirror
// built from it (null when the Axis has no counterpart)
const SIDE_IDS = {};
function sideId(id, team) {
  const d = DEFS[id]; if (!d) return null;
  if (d.team === undefined || d.team === team) return id;
  const key = id + '>' + team;
  if (!(key in SIDE_IDS)) { const m = Object.values(DEFS).find(o => o.team === team && (o.base === id || (d.base && o.id === d.base))); SIDE_IDS[key] = m ? m.id : null; }
  return SIDE_IDS[key];
}
// take command of a vehicle (free in any unlocked tier) in sector col. A player's previous own vehicle is withdrawn.
// Swapping out of a vehicle that is still fighting (a redeploy) has a 20 s cooldown; after losing one there is none.
function deployPlayer(pl, id, col) {
  if (!DEFS[id] || !plHas(pl, id) || NONCOMBAT[DEFS[id].role] || battleOver) return null;
  if (col < 0 && pl.team !== ALLY && !POINTS.some(p => p.eng && p.owner === pl.team)) col = COLS - 1;   // only the Allies start in their homeland
  const old = pl.unit, redeploy = !!(old && !old.dead);
  if (redeploy && pl.deployCd > 0) return null;
  const u = spawnAt(id, pl.team, col); u.mine = true; setControl(pl, u);
  if (redeploy) pl.deployCd = 20;
  if (old && old.mine && !old.dead) despawn(old);
  return u;
}
// hop into the next combat vehicle on the player's side that nobody else is commanding
function switchUnit(pl) {
  const list = units.filter(u => u.team === pl.team && u.def.domain !== 'bld' && !NONCOMBAT[u.def.role] && (!u.ctrl || u.ctrl === pl));
  if (list.length < 2) return false;
  const i = list.indexOf(pl.unit); setControl(pl, list[(i + 1) % list.length]); tell(pl, 'Now commanding: ' + pl.unit.def.name);
  return true;
}
function toggleDive(pl) {
  const u = pl.unit; if (!u || !u.def.sub) return;
  u.diveT = u.diveT > 0.5 ? 0 : 1; tell(pl, u.diveT ? 'Dive! Dive! Dive!' : 'Surfacing.');
}
// Extra computer-run escorts, supply vehicles and buildings are paid for from the player's war chest.
// col: the sector escorts join in. Returns true when it was bought.
function buyFor(pl, id, col) {
  const d = DEFS[id], nc = NONCOMBAT[d.role], isB = d.domain === 'bld';
  if (!sideOk(id, pl.team) || (!isB && !nc && !plHas(pl, id))) return false;
  if (pl.money < d.cost) return false;
  if (isB) { const u = build(pl.team, id); if (!u) return false; pl.money -= d.cost; tell(pl, `Construction started: ${d.name}`, 'good'); return true; }
  pl.money -= d.cost;
  if (nc) {
    if (d.role === 'lander') { sealift(pl.team, d.cargo.slice()); tell(pl, `${d.name} convoy is heading for the beaches`, 'good'); }
    else { spawnAt(id, pl.team); tell(pl, `${d.name} has started its supply runs`, 'good'); }
  } else if (d.domain === 'land') { airlift(pl.team, [id]); tell(pl, `${d.name} is being flown in by cargo plane`, 'good'); }
  else { spawnAt(id, pl.team, col); tell(pl, `${d.name} has joined the fight`, 'good'); }
  return true;
}

// -------------------------------------------------------------- the battle
// A battle ends when the clock runs out, when it is called off, or when a headquarters falls (winner: that side).
function endBattle(winner) {
  if (battleOver) return; battleOver = true;
  Out.over(winner);
}
function setupTeams() {
  setupPoints();
  for (const team of [ALLY, AXIS]) {
    const b = BASE[team], s = FACE[team];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) plots[team].push({ x: b.x + (c - 2) * 46 - s * 10, z: b.z + (r - 1.5) * 46, unit: null, rubble: null });
    // interleave so early buildings spread out
    plots[team].sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z));
    spawn('hq', team, b.x - s * 170, b.z, { yaw: s * Math.PI / 2 });
    spawn('dock', team, HOME[team].dock.x, HOME[team].dock.z, { yaw: HOME[team].dockYaw });
    spawn('airport', team, AIRPORT[team].x, AIRPORT[team].z - 45, { yaw: 0 });
    for (const id of ['factory', 'house', 'house', 'aagun', 'aagun']) build(team, id, true);
    const ids = team === ALLY ? ['spitfire', 'spitfire', 'mustang', 'r4', 'c47', 'troops', 'troops', 'troops', 'jeep', 'sherman', 'sherman', 'halftrack', 'truck', 'truck', 'ward', 'ward', 'pt', 'gato', 'atlanta', 'liberty', 'liberty']
      : ['bf109', 'bf109', 'fw190', 'fa223', 'ju52', 'grenadier', 'grenadier', 'grenadier', 'kubel', 'panzer4', 'panzer4', 'flakwagen', 'opel', 'opel', 'z23', 'z23', 'sboot', 'uboat', 'hipper', 'freighter', 'freighter'];
    // both armies are limited to the unlocked tiers: anything above that is swapped for the basic type
    const basic = team === ALLY ? { air: 'spitfire', land: 'troops', sea: 'ward' } : { air: 'bf109', land: 'grenadier', sea: 'z23' };
    for (const id of ids) spawnAt(has(id) ? id : basic[DEFS[id].domain], team);
    if (team === ALLY) for (let i = 0; i < 2; i++) spawnAt('troops', ALLY, -1);      // the garrison of the homeland
  }
}
// advance the whole battle by dt seconds
function step(dt) {
  time += dt; World.update(dt);
  for (const pl of players) { if (pl.deployCd > 0) pl.deployCd -= dt; controlUnit(pl, dt); }
  for (const u of units.slice()) updateUnit(u, dt);
  separation(); icebergHits(dt);
  updateProjs(dt);
  commander(ALLY, dt); commander(AXIS, dt); raids(dt); economy(dt);
  if (!battleOver) { updatePoints(dt); battleT -= dt; if (battleT <= 0) endBattle(); }
}

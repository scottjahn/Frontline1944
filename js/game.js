'use strict';
// ====================================================================
//  Frontline 1944 - game logic
// ====================================================================
let scene, camera, renderer;
const units = [], wrecks = [], projs = [], fxPool = [];
let player = null, money = 600, state = 'menu', time = 0, uid = 0, lastIncome = 0, incomeT = INCOME_PERIOD;
let camYaw = Math.PI / 2, camPitch = -0.12, fov = 60, zoomTarget = null, deadT = 0, raidT = 28, crewT = 6, hudT = 0;
let focusMesh = null, focusDef = DEFS.spitfire;
const aimDir = new THREE.Vector3(0, 0, 1), aimPoint = new THREE.Vector3();
const input = { keys: {}, fire: false, zoom: false };
const teamAI = [{ budget: 250, timer: 6 }, { budget: 250, timer: 4 }];
const plots = [[], []];
const stats = { kills: 0, defect: 0, caps: 0, credits: 0, killCr: 0, capCr: 0 };
let lastBought = 'spitfire', deployCd = 0, nukeFlash = 0, touchMode = false;
let battleT = BATTLE_LEN, selCol = 0, startOwned = 0, hqMsgT = -99, capT = 0, frontMesh = null, menuTab = 'Deploy';
const V = () => new THREE.Vector3();
const T1 = V(), T2 = V(), T3 = V(), TA = V(), TB = V(), TC = V();
const $ = id => document.getElementById(id);

function fwd(yaw, pitch, out) { const c = Math.cos(pitch); return (out || V()).set(Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c); }
function angDiff(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function hdist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function ground(x, z) { return Math.max(terrainH(x, z), World.water); }

// -------------------------------------------------------------- audio
let actx = null, noiseBuf = null;
function sfx(type, pos) {
  if (!actx) return;
  const d = pos ? pos.distanceTo(camera.position) : 0;
  const vol = type === 'nuke' ? Math.max(0.5, clamp(1 - d / 4000, 0, 1)) : clamp(1 - d / 900, 0, 1); if (vol <= 0.02) return;
  const src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = actx.createBiquadFilter(), g = actx.createGain(), t = actx.currentTime;
  const cfg = { gun: [1800, 0.05, 0.06], shell: [500, 0.25, 0.22], boom: [160, 0.9, 0.5], splash: [900, 0.4, 0.12], nuke: [90, 3.8, 0.95] }[type];
  f.type = 'lowpass'; f.frequency.value = cfg[0];
  g.gain.setValueAtTime(cfg[2] * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + cfg[1]);
  src.connect(f); f.connect(g); g.connect(actx.destination); src.start(t, Math.random() * 0.5, cfg[1] + 0.05);
}
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
}

// -------------------------------------------------------------- effects
const FX_GEO = new THREE.SphereGeometry(1, 8, 6);
function fx(pos, color, s0, s1, life, rise, op) {
  let e = null;
  for (const c of fxPool) if (!c.on) { e = c; break; }
  if (!e) {
    if (fxPool.length >= 320) return;
    e = { mesh: new THREE.Mesh(FX_GEO, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })), on: false };
    fxPool.push(e); scene.add(e.mesh);
  }
  e.on = true; e.t = 0; e.life = life; e.s0 = s0; e.s1 = s1; e.rise = rise || 0; e.op = op === undefined ? 0.9 : op;
  e.mesh.material.color.setHex(color); e.mesh.position.copy(pos); e.mesh.visible = true; e.mesh.scale.setScalar(s0);
}
function updateFx(dt) {
  for (const e of fxPool) {
    if (!e.on) continue;
    e.t += dt; const k = e.t / e.life;
    if (k >= 1) { e.on = false; e.mesh.visible = false; continue; }
    e.mesh.scale.setScalar(e.s0 + (e.s1 - e.s0) * k); e.mesh.material.opacity = e.op * (1 - k); e.mesh.position.y += e.rise * dt;
  }
}
function explode(pos, size) {
  fx(pos, 0xffd060, size * 0.3, size, 0.35); fx(pos, 0xff6a10, size * 0.2, size * 0.75, 0.55);
  fx(pos, 0x2e2e2e, size * 0.4, size * 1.5, 1.8, 7, 0.6);
  sfx(size > 12 ? 'boom' : 'shell', pos);
}
function splashFx(pos, size) { TC.set(pos.x, World.water, pos.z); fx(TC, 0xffffff, size * 0.25, size, 0.7, 9, 0.75); sfx('splash', pos); }
function smoke(pos, size, col) { fx(pos, col || 0x222222, size * 0.5, size * 2.2, 2.6, 7, 0.5); }

// -------------------------------------------------------------- messages
function msg(text, cls) {
  const el = document.createElement('div'); el.textContent = text; if (cls) el.className = cls;
  const f = $('feed'); f.prepend(el);
  while (f.children.length > 7) f.lastChild.remove();
  setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 700); }, 7000);
}
function banner(title, sub) {
  const b = $('banner'); b.innerHTML = ''; b.append(title);
  const s = document.createElement('small'); s.textContent = sub || ''; b.append(s);
  b.style.opacity = 1; clearTimeout(banner.t); banner.t = setTimeout(() => b.style.opacity = 0, 4500);
}

// -------------------------------------------------------------- units
function spawn(id, team, x, z, o) {
  o = o || {}; const d = DEFS[id];
  const u = {
    id: ++uid, def: d, team, hp: d.hp, maxHp: d.hp, pos: V(), prev: V(), vel: V(), steer: V(),
    yaw: o.yaw !== undefined ? o.yaw : (team === ALLY ? Math.PI / 2 : -Math.PI / 2), pitch: 0, roll: 0, speed: 0,
    throttle: 0, turnIn: 0, throttleT: 1, aimYaw: 0, cdGun: rnd(0, 1), cdAlt: rnd(1, 4), cdAA: 0,
    target: null, aaTarget: null, thinkT: rnd(0, 0.6), aaT: rnd(0, 0.5), breakT: 0, breakPt: V(), patrol: null,
    bombQ: 0, bombT: 0, dead: false, built: o.build ? 0 : 1, fxT: rnd(0, 1), mesh: buildModel(d, team), people: [], raid: !!o.raid,
    dive: 0, diveT: 0, cdDC: rnd(0, 2), takeoff: false, hv: V(), mine: false, cargo: null, chute: 0, chuteMesh: null
  };
  u.aimYaw = u.yaw;
  if (d.domain === 'air') { u.pos.set(x, o.alt || 140, z); u.speed = d.speed; }
  else if (d.domain === 'sea') u.pos.set(x, World.water, z);
  else u.pos.set(x, d.model === 'seafort' ? 0 : terrainH(x, z), z);
  fwd(u.yaw, 0, u.steer);
  if (d.domain === 'bld' && d.model !== 'dock') addPeople(u);
  scene.add(u.mesh); syncMesh(u, 1); units.push(u);
  return u;
}
function addPeople(u) {
  const d = u.def, n = Math.min(d.people, 6);
  const cols = d.job === 'workers' ? [0x3b5b8a, 0x2f4a70] : d.job === 'gunners' ? [u.team === ALLY ? 0x5a6a3c : 0x6a6d60] : [0xb04a3a, 0x3a7a5a, 0xc9a23a, 0x6a4a8a, 0xdedede];
  for (let i = 0; i < n; i++) {
    const m = figure(cols[i % cols.length]); m.visible = false; scene.add(m);
    u.people.push({ mesh: m, a: rnd(0, 6.28), r: d.model === 'aagun' ? rnd(2, 3.2) : d.radius + rnd(1.5, 7), sp: (d.model === 'aagun' ? 0.15 : rnd(0.12, 0.3)) * (Math.random() < 0.5 ? -1 : 1) });
  }
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
// where a side falls back to when it holds nothing in a lane. The Allies have no foothold on the Continent
// then: their ground forces have to land at the first point in France.
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
// ---- England: the Axis can only invade while they hold Calais
function calaisHeld() { return PT(4, 1).owner === AXIS; }
// the next English point a side has to take (Allies work outward from home, the Axis inland from Dover); null = it holds them all
function engObjective(team) {
  if (team === ALLY) { for (const p of ENG) if (p.owner !== ALLY) return p; }
  else for (let c = ENG.length - 1; c >= 0; c--) if (ENG[c].owner !== AXIS) return ENG[c];
  return null;
}
// where the Allies muster in England: the last point they still hold before the fighting, or the home base
function engStage() {
  const o = engObjective(ALLY); if (!o) return ENG[ENG.length - 1];
  return o.col > 0 ? ENG[o.col - 1] : { x: BASE[ALLY].x + 260, z: BASE[ALLY].z, lane: ENG_LANE, col: 0 };
}
function engThreat() { return ENG.some(p => p.owner !== ALLY) || units.some(u => u.team === AXIS && u.def.domain === 'land' && u.lane === ENG_LANE); }
function beachNear(x, z) {             // downhill from a place to the nearest shore; n points inland
  let g = 0; while (sdf(x, z) > 0 && g++ < 400) { const n = sdGrad(x, z); x -= n[0] * 10; z -= n[1] * 10; }
  return { x, z, n: sdGrad(x, z) };
}
// landing craft carry Axis ground forces from Calais across the strait to the beaches below Dover
function ferry(ids) {
  const u = sealift(AXIS, ids, ENG[ENG.length - 1], PT(4, 1));
  msg('WARNING: Axis landing craft are crossing from Calais to Dover!', 'bad');
  return u;
}
// a headquarters can only be hurt once the enemy holds ground in its home sector
function hqOpen(team) { const c = team === ALLY ? 0 : COLS - 1; return POINTS.some(p => !p.eng && p.col === c && p.owner === 1 - team) || (team === ALLY && ENG[0].owner === AXIS); }
function allyOwned() { return POINTS.filter(p => p.owner === ALLY).length; }
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
  for (const u of units) if (u.team === team && u.def.role === 'carrier' && u !== player) { const dd = Math.hypot(u.pos.x - near.x, u.pos.z - near.z); if (dd < bd) { bd = dd; best = u; } }
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
  const id = (c.team === ALLY ? ['p38', 'mustang', 'spitfire'] : ['bf110', 'fw190', 'bf109']).find(i => Account.has(i));
  let n = 0; for (const u of units) if (u.wingOf === c) n++;
  if (n >= 4) { if (c === player) msg('The whole air wing is already airborne.'); return false; }
  const k = Math.min(2, 4 - n);
  for (let i = 0; i < k; i++) deckLaunch(id, c, i).wingOf = c;
  if (c.team === ALLY) msg(`${c.def.name} launched ${k} ${DEFS[id].name}${k > 1 ? 's' : ''}`, 'good');
  return true;
}
// Where things enter the battle. Combat units arrive just behind their side's front (or behind sector `col` when the
// player picks one); supply vehicles work from the home base. Aircraft use the home runway, a carrier deck, or arrive airborne.
function spawnAt(id, team, col) {
  const d = DEFS[id], b = BASE[team], s = team === ALLY ? 1 : -1, ap = AIRPORT[team], rear = !!NONCOMBAT[d.role];
  if (d.domain === 'air') {
    if (rear || col === -1) {             // supply flights, and anyone deploying in England, use the home runway
      if (!airportOf(team)) return spawn(id, team, clamp(ap.x - s * 900, -MAP.x, MAP.x), ap.z + rnd(-200, 200), { alt: 160 + rnd(0, 40) });   // airfield lost: fly in from the rear
      if (d.heli) { const x = ap.x + 62 + rnd(-6, 6), z = ap.z - 29 + rnd(-6, 6); return spawn(id, team, x, z, { alt: terrainH(x, z) + 2.3 }); }
      const x = ap.x - s * 150, z = ap.z + rnd(-7, 7);
      const u = spawn(id, team, x, z, { alt: terrainH(x, z) + (d.gear || 1.5) }); u.takeoff = true; u.speed = 0; return u;
    }
    const sp = stage(team, col === undefined ? Math.floor(Math.random() * LANES) : 1, col);
    if (col !== undefined) { const c = carrierOf(team, sp, 3200); if (c) return deckLaunch(id, c, 0); }
    const bv = behind(team, sp.lane, sp.col), r = rnd(900, 1500);
    const x = clamp(sp.x + bv[0] * r + rnd(-300, 300), -MAP.x, MAP.x), z = clamp(sp.z + bv[1] * r + rnd(-300, 300), -MAP.z, MAP.z);
    return spawn(id, team, x, z, { alt: d.heli ? ground(x, z) + 60 : 170 + rnd(0, 40), yaw: Math.atan2(sp.x - x, sp.z - z) });
  }
  if (d.domain === 'land') {
    if (rear) { const q = landSpot(b.x + s * 190, b.z, 0, 110); return spawn(id, team, q[0], q[1]); }
    let lane = Math.random() < 0.5 ? 0 : 1, sp = col === -1 ? engStage() : stage(team, lane, col);
    if (col === -1) lane = ENG_LANE;
    else if (col !== undefined) { const o = stage(team, 1 - lane, col); if ((o.col - sp.col) * s > 0) { sp = o; lane = 1 - lane; } }
    const bv = behind(team, sp.lane, sp.col), q = landSpot(sp.x, sp.z, 50, 160, bv);
    const u = spawn(id, team, q[0], q[1], { yaw: Math.atan2(-bv[0], -bv[1]) }); u.lane = lane; return u;
  }
  if (rear) { const P = HOME[team].port, q = seaSpot(P.x, P.z, 0, 160); return spawn(id, team, q[0], q[1], { yaw: HOME[team].dockYaw }); }
  const sp = stage(team, SEA_LANE, col), bv = behind(team, sp.lane, sp.col), q = seaSpot(sp.x, sp.z, 120, 380, bv);
  return spawn(id, team, q[0], q[1], { yaw: Math.atan2(-bv[0], -bv[1]) });
}
function despawn(u) {
  u.dead = true; const i = units.indexOf(u); if (i >= 0) units.splice(i, 1);
  scene.remove(u.mesh); for (const p of u.people) scene.remove(p.mesh);
}
// ---- reinforcements: ground forces arrive by military cargo plane (parachute) or by landing ship
const CHUTE_GEO = new THREE.SphereGeometry(7, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
const CHUTE_MAT = new THREE.MeshLambertMaterial({ color: 0xf2efe2, side: THREE.DoubleSide });
function airlift(team, ids) {
  const lane = Math.random() < 0.5 ? 0 : 1, sp = stage(team, lane), bv = behind(team, sp.lane, sp.col), q = landSpot(sp.x, sp.z, 60, 220, bv);
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
    n.chuteMesh = new THREE.Mesh(CHUTE_GEO, CHUTE_MAT); n.chuteMesh.position.y = 9; n.chuteMesh.userData.chute = true; n.mesh.add(n.chuteMesh);
    n.pos.y = terrainH(x, z) + n.chute; n.lane = u.dropLane; syncMesh(n, 1);
    if (u.team === ALLY) msg(`${u.def.name} dropped reinforcements: ${n.def.name}`, 'good');
  }
  u.cargo = null;
}
// to: the place to land near (default: the side's foremost coast town). from: a held port to sail from (default: in from the open sea)
function sealift(team, ids, to, from) {
  const b = beachNear((to || stage(team, 1)).x, (to || stage(team, 1)).z), n = b.n; let sx, sz;
  if (from) { const f = beachNear(from.x, from.z), q = seaSpot(f.x - f.n[0] * 200, f.z - f.n[1] * 200, 0, 120); sx = q[0]; sz = q[1]; }
  else { let k = 900; while (k > 200 && sdf(b.x - n[0] * k, b.z - n[1] * k) > -100) k -= 100; sx = b.x - n[0] * k; sz = b.z - n[1] * k; }
  const u = spawn(team === ALLY ? 'lst' : 'mfp', team, sx, sz, { yaw: Math.atan2(b.x - sx, b.z - sz) });
  u.cargo = ids; u.landLane = to && to.eng ? ENG_LANE : 1;
  u.beach = { x: b.x - n[0] * 50, z: b.z - n[1] * 50 }; u.landPt = { x: b.x + n[0] * 35, z: b.z + n[1] * 35 }; u.exit = { x: sx, z: sz };
  return u;
}
function unload(u) {
  for (const id of u.cargo) { const q = landSpot(u.landPt.x, u.landPt.z, 0, 45); spawn(id, u.team, q[0], q[1], { yaw: u.yaw }).lane = u.landLane; }
  if (u.team === ALLY) msg(`${u.def.name} landed ${u.cargo.length} units on the beach`, 'good');
  else if (u.landLane === ENG_LANE) msg(`Axis troops are ashore in England! ${u.cargo.length} units landed near Dover.`, 'bad');
  u.cargo = null;
}
function requisition(id, team) {
  const d = DEFS[id];
  if (d.domain !== 'land' || d.role === 'cargo') return spawnAt(id, team);
  const landers = units.filter(u => u.team === team && u.def.role === 'lander').length;
  if (team === AXIS && calaisHeld() && landers < 2 && Math.random() < 0.3) return ferry([id, 'grenadier']);          // invade England
  if (team === ALLY && engThreat() && Math.random() < 0.45) return spawnAt(id, team, -1);                           // home forces turn out to meet them
  if (Math.random() < 0.3 && !landers)
    return sealift(team, [id].concat(team === ALLY ? ['troops', 'jeep'] : ['grenadier', 'kubel']));
  return airlift(team, [id]);
}
function syncMesh(u, dt) {
  const m = u.mesh, d = u.def; m.position.copy(u.pos);
  if (d.domain === 'bld') { m.rotation.y = u.yaw; m.scale.y = Math.max(0.04, u.built); }
  else m.rotation.set(-u.pitch, u.yaw, u.roll, 'YXZ');
  const ts = m.userData.turrets;
  if (ts) { const want = u.aimYaw - u.yaw; for (const t of ts) t.rotation.y += angDiff(want, t.rotation.y) * Math.min(1, dt * 5); }
  if (m.userData.rotor) m.userData.rotor.rotation.y += dt * 24;
  const sl = m.userData.soldiers;
  if (sl) {
    const alive = Math.ceil(u.hp / u.maxHp * sl.length), mv = Math.abs(u.speed) > 1;
    for (let i = 0; i < sl.length; i++) { sl[i].visible = i < alive; sl[i].position.y = mv ? Math.abs(Math.sin(time * 9 + sl[i].userData.ph)) * 0.25 : 0; }
  }
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
  if (u.pos.y < ground(u.pos.x, u.pos.z) + 1.2) { if (u === player) msg('You flew into the ' + (terrainH(u.pos.x, u.pos.z) > World.water ? 'ground' : 'sea') + '.', 'bad'); kill(u, null, false); }
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
    if (u.chute <= 0 && u.chuteMesh) { u.mesh.remove(u.chuteMesh); u.chuteMesh = null; }
    return;
  }
  u.yaw += u.turnIn * d.turn * dt;
  const here = terrainH(u.pos.x, u.pos.z), wet = here < World.water;
  const want = u.throttle * d.speed * (u.throttle < 0 ? 0.5 : 1) * (wet ? 0.45 : 1);
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
  if (nh > World.water - 2.6 && nh > here) { u.speed *= 0.5; if (!u.aground) { u.aground = true; if (u === player) msg('Shallows! You are running aground.', 'bad'); } }
  else { u.pos.x = nx; u.pos.z = nz; u.aground = false; }
  u.pos.y = World.water - (d.sub ? u.dive * d.diveDepth : 0);
  u.roll = Math.sin(time * 0.9 + u.id) * 0.025 - u.turnIn * 0.04 * (u.speed / d.speed);
  u.pitch = Math.sin(time * 0.7 + u.id * 2) * 0.012;
}

// -------------------------------------------------------------- weapons
const PGEO = {
  bullet: new THREE.BoxGeometry(0.18, 0.18, 3.2), shell: new THREE.SphereGeometry(0.6, 6, 5),
  bomb: new THREE.CylinderGeometry(0.45, 0.3, 2.2, 6).rotateX(Math.PI / 2), nuke: new THREE.CylinderGeometry(1.5, 0.9, 6, 8).rotateX(Math.PI / 2), torpedo: new THREE.CylinderGeometry(0.45, 0.45, 5, 6).rotateX(Math.PI / 2)
};
const PMAT = {
  bullet: new THREE.MeshBasicMaterial({ color: 0xffe27a }), shell: new THREE.MeshBasicMaterial({ color: 0xff9a3a }),
  bomb: new THREE.MeshLambertMaterial({ color: 0x2a2d28 }), nuke: new THREE.MeshLambertMaterial({ color: 0xd8c23a }), torpedo: new THREE.MeshLambertMaterial({ color: 0x30343a })
};
function addProj(kind, o, vel, owner, dmg, splash, life) {
  const m = new THREE.Mesh(PGEO[kind], PMAT[kind]); m.position.copy(o); scene.add(m);
  projs.push({ kind, pos: o.clone(), prev: o.clone(), vel, team: owner.team, owner, pl: owner === player, dmg, splash, life, mesh: m, wake: 0, swim: false });
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
  addProj(w.kind, o, dir.multiplyScalar(w.vel), u, w.dmg, w.splash || 0, w.range / w.vel);
  sfx(w.kind === 'bullet' ? 'gun' : 'shell', u.pos);
  if (w.kind === 'shell') fx(o, 0xffd9a0, 0.8, 3.2, 0.15);
}
function fireGun(u, aim, xs) {
  const g = u.def.gun; if (!g || u.cdGun > 0 || (u.def.sub && u.dive > 0.3)) return;
  u.cdGun = g.rate * World.reload * (u === player ? 1 : 1.6);
  shoot(u, g, aim, xs || 0);
}
function fireAlt(u, aim) {
  const a = u.def.alt; if (!a || u.cdAlt > 0) return false;
  u.cdAlt = a.cd * World.reload;
  if (a.kind === 'launch') { if (!launchWing(u)) u.cdAlt = 4; return true; }
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
    if (p.kind === 'bomb' || p.kind === 'nuke' || (p.kind === 'torpedo' && !p.swim)) p.vel.y -= 40 * dt;
    p.pos.addScaledVector(p.vel, dt);
    const th = terrainH(p.pos.x, p.pos.z);
    let done = false, hit = null;
    if (p.kind === 'torpedo') {
      if (!p.swim && p.pos.y <= World.water - 0.3) { if (th > World.water - 0.8) done = true; else { p.swim = true; p.vel.y = 0; splashFx(p.pos, 5); } }
      if (p.swim) {
        p.pos.y = World.water - 0.3; if (th > World.water - 0.8) done = true;
        p.wake -= dt; if (p.wake <= 0) { p.wake = 0.12; TC.copy(p.pos).setY(World.water + 0.1); fx(TC, 0xffffff, 0.8, 2.4, 1.6, 0, 0.5); }
      }
    } else if (p.pos.y <= Math.max(th, World.water)) { done = true; p.pos.y = Math.max(th, World.water); }
    if (!done) for (const u of units) {
      if (u.team === p.team || u.dead) continue;
      if (p.kind === 'torpedo' && (u.def.domain !== 'sea' || !p.swim)) continue;
      if (u.def.sub && u.dive > 0.5 && p.kind !== 'torpedo') continue;   // submerged: only torpedoes and blast reach it
      if (hitTest(u, p)) { hit = u; break; }
    }
    if (hit || done || p.life <= 0) {
      if (hit || done) impact(p, hit, th);
      scene.remove(p.mesh); projs.splice(i, 1); continue;
    }
    p.mesh.position.copy(p.pos); T3.copy(p.pos).add(p.vel); p.mesh.lookAt(T3);
  }
}
function nukeBlast(p) {
  const pos = p.pos.clone(), R = p.splash;
  nukeFlash = 1.8; sfx('nuke', pos);
  fx(pos, 0xffffff, 30, R * 0.9, 1.3, 0, 1); fx(pos, 0xffe08a, 20, R * 0.6, 2.4, 6, 0.95); fx(pos, 0xff7a20, 15, R * 0.42, 3.8, 10, 0.9);
  for (let i = 0; i < 9; i++) { TC.copy(pos); TC.y += i * 22; fx(TC, i > 6 ? 0x6a5a50 : 0x4a4038, 14, i > 6 ? 110 : 38, 9 + i * 0.6, 16, 0.75); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; TC.set(pos.x + Math.sin(a) * R * 0.55, pos.y + 4, pos.z + Math.cos(a) * R * 0.55); fx(TC, 0xd8d0c0, 10, 48, 3.2, 3, 0.5); }
  for (const u of units.slice()) {
    if (u.team === p.team || u.dead) continue;
    const dd = distToUnit(u, pos);
    if (dd < R) damage(u, p.dmg * (1 - dd / R) * (u.def.model === 'hq' ? 0.35 : 1), p.owner, p.pl);
  }
  msg(p.team === ALLY ? 'ATOMIC BOMB DETONATED. Everything beneath it is gone.' : 'The Axis have dropped an atomic bomb!', p.team === ALLY ? 'gold' : 'bad');
}
function impact(p, hit, th) {
  if (p.kind === 'nuke') { nukeBlast(p); return; }
  const pos = p.pos.clone(), wet = th < World.water;
  if (hit) damage(hit, p.dmg * (p.kind === 'bullet' && hit.def.armor ? 0.2 : 1), p.owner, p.pl);
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
function bountyOf(d) { return d.model === 'hq' ? 2000 : Math.round(Math.max(40, (d.aiCost || d.cost || 300) * 0.3) / 5) * 5; }
function damage(u, amt, att, pl) {
  if (u.dead) return;
  if (u.def.model === 'hq' && !hqOpen(u.team)) {
    if (pl && time - hqMsgT > 8) { hqMsgT = time; msg(`The ${TEAM_NAME[u.team]} headquarters is out of reach. Take a point in the ${SECTORS[u.team === ALLY ? 0 : COLS - 1]} sector first.`, 'bad'); }
    return;
  }
  if (!pl) amt *= 0.45;            // AI gunnery is weaker than the player's: keeps the war from burning out
  u.hp -= amt;
  if (u === player) hurtFlash = 0.25;
  if (u.def.domain === 'sea' && u !== player && !u.rolled && u.hp < u.maxHp * 0.25) {
    u.rolled = true;
    if (Math.random() < 0.38) { defect(u, pl); return; }
  }
  if (u.hp <= 0) kill(u, att, pl);
}
let hurtFlash = 0;
function defect(u, pl) {
  const old = u.team; u.team = 1 - old;
  u.hp = Math.max(u.hp, u.maxHp * 0.4); u.target = null; u.aaTarget = null; u.route = null; u.patrol = null;
  u.mesh.userData.teamMat.color.setHex(TEAM_COL[u.team]);
  TC.copy(u.pos).setY(u.pos.y + 14); fx(TC, 0xffffff, 3, 16, 1.2, 4, 0.7);
  if (u.team === ALLY) {
    stats.defect++;
    const bonus = pl ? bountyOf(u.def) : 0; money += bonus;
    msg(`${u.def.name} strikes her colours and DEFECTS to the Allies!${bonus ? ' +$' + bonus : ''}`, 'gold');
  } else msg(`Mutiny! ${u.def.name} has defected to the Axis!`, 'bad');
}
const WRECK_MAT = [0x1d1b19, 0x2e2a26, 0x3a2a20].map(c => new THREE.MeshLambertMaterial({ color: c }));
function makeWreck(u) {
  const m = u.mesh, d = u.def; let i = 0;
  m.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.person || o.userData.chute || o.userData.decal || o.material === PROP) { o.visible = false; return; }
    o.material = WRECK_MAT[(i++) % 3];
  });
  const w = { mesh: m, def: d, t: 0, k: 0, smokeFor: rnd(25, 45), smokeT: 0, vel: u.vel.clone(), state: 'burn', spin: rnd(-2.5, 2.5), yaw: u.yaw, pitch: u.pitch, roll: u.roll, tRoll: rnd(0.25, 0.6) * (Math.random() < 0.5 ? -1 : 1), baseY: u.pos.y };
  if (d.domain === 'air') w.state = 'fall';
  else if (d.domain === 'sea') w.state = 'sink';
  else if (d.domain === 'bld') { m.scale.y = 0.28; m.rotation.z = rnd(-0.06, 0.06); }
  else if (m.userData.soldiers) for (const s of m.userData.soldiers) { s.visible = true; s.rotation.x = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); s.rotation.y = rnd(0, 6); s.position.y = 0.3; }
  else { m.rotation.z = rnd(-0.18, 0.18); if (m.userData.turrets) m.userData.turrets[0].rotation.set(rnd(-0.15, 0.1), rnd(0, 6), rnd(-0.2, 0.2)); }
  if (u.chute > 0) w.state = 'fall';
  wrecks.push(w);
  if (wrecks.length > 240) scene.remove(wrecks.shift().mesh);
  return w;
}
function updateWrecks(dt) {
  for (const w of wrecks) {
    w.t += dt; const m = w.mesh;
    if (w.state === 'fall') {
      w.vel.y -= 32 * dt; w.vel.x *= 1 - 0.25 * dt; w.vel.z *= 1 - 0.25 * dt;
      m.position.addScaledVector(w.vel, dt); w.roll += w.spin * dt; w.pitch = Math.max(-1.1, w.pitch - 0.5 * dt);
      m.rotation.set(-w.pitch, w.yaw, w.roll, 'YXZ');
      w.smokeT -= dt; if (w.smokeT <= 0) { w.smokeT = 0.06; fx(m.position, 0x1c1c1c, 1.5, 5, 1.6, 2, 0.6); if (Math.random() < 0.4) fx(m.position, 0xff7a20, 1, 2.5, 0.3); }
      const th = terrainH(m.position.x, m.position.z);
      if (m.position.y <= Math.max(th, World.water) + 1) {
        explode(m.position, w.def.radius * 2.5);
        if (th >= World.water) { m.position.y = th + 0.7; m.rotation.set(rnd(-0.25, 0.1), w.yaw, rnd(-0.5, 0.5), 'YXZ'); w.state = 'burn'; }
        else { splashFx(m.position, w.def.radius * 2); m.position.y = World.water; w.baseY = World.water; w.state = 'sink'; w.t = 0; }
      }
      continue;
    }
    if (w.state === 'sink') {
      w.k = Math.min(1, w.k + dt / 12);
      const air = w.def.domain === 'air';
      const depth = air ? w.def.radius * 0.25 : w.def.beam * 0.42;
      m.position.y = w.baseY - depth * w.k;
      if (air) m.rotation.set(0.5 * w.k, w.yaw, w.roll * (1 - w.k) + 0.3 * w.k, 'YXZ');
      else m.rotation.set(0.1 * w.k, w.yaw, w.tRoll * w.k, 'YXZ');
      if (w.k >= 1) w.state = 'burn';
    }
    if (w.t < w.smokeFor) {
      w.smokeT -= dt;
      if (w.smokeT <= 0) {
        w.smokeT = 0.35;
        if (m.position.distanceToSquared(camera.position) < 1400 * 1400) { TC.copy(m.position); TC.y += (w.def.centerY || 1) + 2; smoke(TC, w.def.len ? 5 : 2.5); }
      }
    }
  }
}
function kill(u, att, pl) {
  if (u.dead) return;
  u.dead = true; const i = units.indexOf(u); if (i >= 0) units.splice(i, 1);
  const d = u.def;
  explode(centerOf(u, TA), d.len ? d.len * 0.45 : d.radius * 2.4);
  for (const p of u.people) scene.remove(p.mesh);
  const b = bountyOf(d);
  if (u.team === AXIS) {
    if (pl) { const cr = Math.max(10, Math.round(b * 0.4 / 5) * 5); money += b; stats.kills++; stats.credits += cr; stats.killCr += cr; msg(`Destroyed ${d.name}  +$${b} · +${cr} credits`, 'gold'); }
    else teamAI[ALLY].budget += b * 0.5;
  } else {
    teamAI[AXIS].budget += b * 0.5;
    if (d.domain === 'bld') msg(`We lost a ${d.name}!`, 'bad');
  }
  const w = makeWreck(u);
  if (d.domain === 'bld') { const pl_ = plots[u.team].find(p => p.unit === u); if (pl_) { pl_.unit = null; pl_.rubble = w; } const cp = POINTS.find(p => p.post === u); if (cp) cp.rubble = w; }
  if (u === player) playerDied(w);
  if (d.model === 'hq') endBattle(u.team === AXIS ? 'won' : 'lost');
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
    const dist = u.pos.distanceTo(e.pos); if (dist > sight) continue;
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
  for (const e of units) { if (e.team === u.team || e.def.domain !== 'air') continue; const dd = u.pos.distanceTo(e.pos); if (dd < bd) { bd = dd; best = e; } }
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
  const f = frontPos(lane); return V().set(cx(f.x + rnd(-700, 700)), rnd(110, 200), cz(f.z + rnd(-600, 600)));
}
function aiAir(u, dt) {
  const d = u.def, t = u.target, g = T1, gr = ground(u.pos.x, u.pos.z);
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
function aiLand(u, dt) {
  const d = u.def, t = u.target; let gx, gz, stop;
  if (t) { gx = t.pos.x; gz = t.pos.z; stop = d.gun.range * 0.7; }
  else if (d.role === 'cargo') {       // supply truck: base <-> depot up the road
    if (!u.route) {
      const b = BASE[u.team], s = u.team === ALLY ? 1 : -1, dp = HOME[u.team].depot;
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
    else if (eng && u.team === ALLY) { const p = ENG[ENG.length - 1]; gx = p.x + jx * 2; gz = p.z + jz * 2; stop = 30; }   // England is secure: stand guard at Dover
    else if (eng) { const b = BASE[ALLY]; gx = b.x; gz = b.z + jx; stop = 60; }                                   // England has fallen: on to the Allied headquarters
    else if (u.team === ALLY) { const b = BASE[AXIS]; gx = b.x; gz = b.z + jx; stop = 60; }      // lane won: on to Berlin
    else { const p = PT(0, u.lane); gx = p.x + jx; gz = p.z + jz; stop = 40; }                   // the Axis cannot cross the Channel: dig in on the coast
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
    if (d.alt && u.cdAlt <= 0 && d3 < d.alt.range && t.def.armor) fireAlt(u, TA);
  } else u.aimYaw = u.yaw;
}
function dockOf(team) { for (const u of units) if (u.def.model === 'dock' && u.team === team) return u; return null; }
function aiSea(u, dt) {
  const d = u.def, t = u.target; let gx, gz, thr = 1, direct = false;
  if (d.role === 'carrier' && u.cdAlt <= 0 && u !== player) fireAlt(u, u.pos);
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
function deliver(u) {
  const pay = u.def.pay || 100;
  if (u.team === ALLY) { money += pay; msg(`${u.def.name} delivered cargo  +$${pay}`, 'good'); }
  else teamAI[AXIS].budget += pay * 0.6;
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
    if (u.built < 1) { u.built = Math.min(1, u.built + dt / 8); if (u.built >= 1 && u.team === ALLY) msg(`${d.name} is operational`, 'good'); }
    else {
      const near = u.pos.distanceToSquared(camera.position) < 700 * 700;
      for (const p of u.people) {
        p.mesh.visible = near; if (!near) continue;
        p.a += p.sp * dt; const x = u.pos.x + Math.sin(p.a) * p.r, z = u.pos.z + Math.cos(p.a) * p.r;
        p.mesh.position.set(x, terrainH(x, z) + 0.75 + Math.abs(Math.sin(time * 7 + p.a * 9)) * 0.12, z); p.mesh.rotation.y = p.a + (p.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      if (d.model === 'factory' && near) { u.fxT -= dt; if (u.fxT <= 0) { u.fxT = 0.5; TC.copy(u.mesh.userData.stack).add(u.pos); fx(TC, 0x777777, 1.2, 5, 3, 5, 0.4); } }
    }
  } else {
    if (u !== player) {
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
  if (u.hp < u.maxHp * 0.5 && d.domain !== 'bld' || u.hp < u.maxHp * 0.35) {
    u.fxT -= dt; if (u.fxT <= 0) { u.fxT = 0.3; centerOf(u, TC); TC.y += 1.5; smoke(TC, d.len ? 3.5 : 1.6, u.hp < u.maxHp * 0.25 ? 0x151515 : 0x555555); }
  }
  syncMesh(u, dt);
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
        if (u === player && time - (u.iceMsg || 0) > 4) { u.iceMsg = time; msg('ICEBERG! The hull is taking damage.', 'bad'); sfx('boom', u.pos); }
        damage(u, 160 * dt + Math.abs(u.speed) * 0.9, null, false);
        if (u.dead) break;
      }
    }
  }
}

// -------------------------------------------------------------- economy & commanders
function incomeOf(team) { let s = 0; for (const u of units) if (u.team === team && u.def.domain === 'bld' && u.built >= 1) s += u.def.people * u.def.perHead; return s; }
function build(team, id, instant) {
  const p = plots[team].find(p => !p.unit); if (!p) return null;
  if (p.rubble) { scene.remove(p.rubble.mesh); const i = wrecks.indexOf(p.rubble); if (i >= 0) wrecks.splice(i, 1); p.rubble = null; }
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
  let mobile = 0, merch = 0;
  for (const u of units) if (u.team === team && u.def.domain !== 'bld') { mobile++; if (u.def.role === 'merchant') merch++; }
  if (mobile >= UNIT_CAP) return;
  const list = ROSTER[team].filter(i => Account.has(i)), id = list[Math.floor(Math.random() * list.length)], d = DEFS[id], c = d.aiCost || d.cost;
  if (d.max && units.filter(u => u.team === team && u.def === d).length >= d.max) return;
  if (c <= ai.budget) { ai.budget -= c; requisition(id, team); }
}
function raids(dt) {
  raidT -= dt; if (raidT > 0) return; raidT = rnd(26, 44);
  const team = Math.random() < 0.5 ? ALLY : AXIS, cx = v => clamp(v, -MAP.x - 100, MAP.x + 100), cz = v => clamp(v, -MAP.z - 100, MAP.z + 100);
  const bid = team === ALLY ? 'b25' : 'ju88', tid = team === ALLY ? 'avenger' : 'fi167';
  if (Math.random() < 0.45 && Account.has(bid)) {          // level-bomber formation crossing the front from its own rear
    const lane = Math.random() < 0.5 ? 0 : 1, sp = stage(team, lane), bv = behind(team, sp.lane, sp.col), f = frontPos(lane), yaw = Math.atan2(-bv[0], -bv[1]);
    for (let i = 0; i < 3; i++) spawn(bid, team, cx(f.x + bv[0] * (2300 + i * 45) - bv[1] * (i - 1) * 55), cz(f.z + bv[1] * (2300 + i * 45) + bv[0] * (i - 1) * 55), { alt: 210, raid: true, yaw });
    msg(team === ALLY ? 'Allied bomber formation crossing the front!' : 'WARNING: Axis bomber formation inbound!', team === ALLY ? 'good' : 'bad');
    return;
  }
  if (!Account.has(tid) || !units.some(u => u.team !== team && u.def.domain === 'sea')) return;
  const sp = stage(team, SEA_LANE), bv = behind(team, sp.lane, sp.col), f = frontPos(SEA_LANE), r = rnd(1100, 1700), n = 2 + (Math.random() < 0.4 ? 1 : 0);
  for (let i = 0; i < n; i++) spawn(tid, team, cx(f.x + bv[0] * r - bv[1] * i * 40), cz(f.z + bv[1] * r + bv[0] * i * 40), { alt: 110, yaw: Math.atan2(-bv[0], -bv[1]), raid: true });
  msg(team === ALLY ? 'Allied torpedo bombers inbound over the sea!' : 'WARNING: Axis torpedo bombers hunting our ships!', team === ALLY ? 'good' : 'bad');
}
// ---- capture points: destroy the command post, then hold the ground (or the water) to take the point
const BEAM_GEO = new THREE.CylinderGeometry(5, 5, 320, 8, 1, true);
function ownerHex(o) { return o < 0 ? 0xf2f0e0 : TEAM_COL[o]; }
function setOwner(p, team) {
  p.owner = team; p.prog = 0; p.beam.material.color.setHex(ownerHex(team));
  for (const u of units) u.patrol = null;
  refreshFront();
}
function setupPoints() {
  for (const p of POINTS) {
    p.y = p.sea ? 0 : terrainH(p.x, p.z);
    p.beam = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color: ownerHex(p.owner), transparent: true, opacity: 0.17, depthWrite: false, side: THREE.DoubleSide }));
    p.beam.position.set(p.x, p.y + 175, p.z); scene.add(p.beam);
    if (p.owner >= 0) p.post = spawn(p.sea ? 'seafort' : 'outpost', p.owner, p.x, p.z, { yaw: 0 });
  }
  startOwned = allyOwned(); refreshFront();
}
function capture(p, team, byPlayer) {
  if (p.rubble) { scene.remove(p.rubble.mesh); const i = wrecks.indexOf(p.rubble); if (i >= 0) wrecks.splice(i, 1); p.rubble = null; }
  setOwner(p, team);
  p.post = spawn(p.sea ? 'seafort' : 'outpost', team, p.x, p.z, { build: true, yaw: 0 });
  if (team === ALLY) {
    stats.caps++;
    if (byPlayer) { stats.credits += 250; stats.capCr += 250; money += 400; }
    banner(p.name + (p.eng ? ' retaken' : ' captured'), p.eng ? 'The invaders are pushed back toward the sea' : 'The front line moves east');
    msg(`${p.name} is ours!` + (byPlayer ? '  +$400 · +250 credits' : ''), 'gold');
  } else { banner(p.name + ' lost', p.eng ? 'The invasion of England advances' : 'The Axis push the front line west'); msg(`The Axis have taken ${p.name}!`, 'bad'); }
}
function updatePoints(dt) {
  capT -= dt; if (capT > 0) return; capT = 0.5;
  for (const p of POINTS) {
    if (p.post && p.post.dead) {
      const old = p.owner; p.post = null; setOwner(p, -1);
      msg(old === AXIS ? `${p.name}: Axis command post destroyed. Move in and hold it!` : `${p.name}: our command post has fallen! Hold the ground or lose the sector.`, old === AXIS ? 'good' : 'bad');
    }
    p.contest = false;
    if (p.post) continue;
    const R = p.sea ? CAP_R_SEA : CAP_R, n = [0, 0]; let pl = false;
    for (const u of units) {
      const d = u.def;
      if (p.sea ? (d.domain !== 'sea' || NONCOMBAT[d.role] || (d.sub && u.dive > 0.5)) : (d.domain !== 'land' || d.role === 'cargo' || u.chute > 0)) continue;
      if (Math.abs(u.pos.x - p.x) > R || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > R) continue;
      n[u.team]++; if (u === player) pl = true;
    }
    p.contest = n[0] > 0 && n[1] > 0;
    const step = 0.5 / 28;             // one unit takes 28 s; three or more take about 9 s
    if (n[0] && !n[1] && canCap(p, ALLY)) { p.prog += step * Math.min(n[0], 3); if (pl) p.plCap = true; }
    else if (n[1] && !n[0] && canCap(p, AXIS)) p.prog -= step * Math.min(n[1], 3);
    else if (!n[0] && !n[1]) p.prog -= Math.sign(p.prog) * Math.min(Math.abs(p.prog), step * 0.5);
    if (p.prog >= 1) { capture(p, ALLY, p.plCap); p.plCap = false; }
    else if (p.prog <= -1) { capture(p, AXIS); p.plCap = false; }
  }
}
// the front line, drawn in the world as a faint curtain following the ground
const FRONT_MAT = new THREE.MeshBasicMaterial({ color: 0xffb030, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
function refreshFront() {
  const path = frontPath(), pts = [], pos = [], H = 30;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 90));
    for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  pts.push(path[path.length - 1]);
  for (const q of pts) q[2] = Math.max(terrainH(q[0], q[1]), 3.5) + 0.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    pos.push(a[0], a[2], a[1], b[0], b[2], b[1], b[0], b[2] + H, b[1], a[0], a[2], a[1], b[0], b[2] + H, b[1], a[0], a[2] + H, a[1]);
  }
  if (frontMesh) { scene.remove(frontMesh); frontMesh.geometry.dispose(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  frontMesh = new THREE.Mesh(geo, FRONT_MAT); frontMesh.frustumCulled = false; scene.add(frontMesh);
}
const GRIPES = [
  'Sailor: "My socks are wet. Again."', 'Gunner: "Can\'t see a thing through this rain, sir."', 'Loader: "Shells keep slipping out of my hands!"',
  'Deckhand: "Permission to complain about the weather, sir?"', 'Gunner: "The breech is flooded. Give me a minute."', 'Cook: "The soup is 40% rainwater now."',
  'Private: "I joined the army to get OUT of the rain."', 'Helmsman: "Wipers. Somebody invent wipers."'
];
function economy(dt) {
  incomeT -= dt;
  if (incomeT <= 0) { incomeT = INCOME_PERIOD; lastIncome = incomeOf(ALLY); money += lastIncome; }
  if (World.info.name === 'Rainy Season') { crewT -= dt; if (crewT <= 0) { crewT = rnd(9, 15); msg(GRIPES[Math.floor(Math.random() * GRIPES.length)], 'crew'); } }
}

// -------------------------------------------------------------- player
function setPlayer(u) {
  player = u; focusMesh = u.mesh; focusDef = u.def; camYaw = u.yaw; camPitch = u.def.domain === 'air' && !u.def.heli ? 0 : -0.12; u.hv.set(0, 0, 0); u.target = null; u.breakT = 0; u.throttleT = 1; u.cdGun = 0; u.cdAlt = Math.min(u.cdAlt, 1);
  $('vname').textContent = u.def.name;
  $('vdomain').textContent = (u.def.heli ? 'Helicopter' : u.def.sub ? 'Submarine' : { air: 'Aircraft', land: 'Ground forces', sea: 'Warship' }[u.def.domain]) + ' · crew ' + u.def.crew;
  $('w2row').style.display = u.def.alt ? 'flex' : 'none'; if (u.def.alt) $('w2n').textContent = u.def.alt.label;
  $('w1n').textContent = u.def.gun ? (u.def.gun.kind === 'shell' ? 'Main guns' : 'Machine guns') : 'Unarmed';
  const tc = $('touch'); tc.classList.toggle('heli', !!u.def.heli); tc.classList.toggle('sub', !!u.def.sub); tc.classList.toggle('noalt', !u.def.alt);
  if (u.def.alt) $('tAlt').textContent = u.def.alt.label.split(' ')[0];
  $('tDive').textContent = u.diveT > 0.5 ? 'Rise' : 'Dive';
}
function toggleDive() {
  if (state !== 'playing' || !player || !player.def.sub) return;
  player.diveT = player.diveT > 0.5 ? 0 : 1; msg(player.diveT ? 'Dive! Dive! Dive!' : 'Surfacing.'); $('tDive').textContent = player.diveT ? 'Rise' : 'Dive';
}
function playerDied(w) { player = null; focusMesh = w.mesh; state = 'dead'; deadT = 2.6; input.fire = false; input.zoom = false; msg('Your vehicle was destroyed.', 'bad'); }
function switchVehicle() {
  if (state !== 'playing') return;
  const list = units.filter(u => u.team === ALLY && u.def.domain !== 'bld' && !NONCOMBAT[u.def.role]);
  if (list.length < 2) return;
  const i = list.indexOf(player); setPlayer(list[(i + 1) % list.length]); msg('Now commanding: ' + player.def.name);
}
function computeAim() {
  fwd(camYaw, camPitch, aimDir); const o = camera.position; let best = 1500;
  for (const u of units) {
    if (u === player) continue;
    centerOf(u, TC).sub(o); const t = TC.dot(aimDir); if (t < 8 || t > best) continue;
    const r = u.def.len ? u.def.len * 0.4 : u.def.radius * 1.3;
    if (TC.lengthSq() - t * t < r * r) best = t;
  }
  for (let t = 10; t < best; t += 10) {
    TC.copy(o).addScaledVector(aimDir, t);
    if (TC.y < ground(TC.x, TC.z)) { best = t; break; }
  }
  aimPoint.copy(o).addScaledVector(aimDir, best);
}
function nearestToReticle(maxAng) {
  let best = null, ba = maxAng;
  for (const u of units) {
    if (u.team === ALLY) continue;
    centerOf(u, TC).sub(camera.position); const dist = TC.length(); if (dist > 2600 * World.vis) continue;
    if (u.def.sub && u.dive > 0.5 && dist > 450) continue;
    const ang = Math.acos(clamp(TC.dot(aimDir) / dist, -1, 1)); if (ang < ba) { ba = ang; best = u; }
  }
  return best;
}
function snapZoom() {
  fwd(camYaw, camPitch, aimDir);
  const t = nearestToReticle(0.3); if (!t) return;
  centerOf(t, TC).sub(camera.position); const l = TC.length();
  camYaw = Math.atan2(TC.x, TC.z); camPitch = Math.asin(clamp(TC.y / l, -1, 1));
}
function playerControl(dt) {
  const u = player; if (!u || u.dead || state !== 'playing') return;
  const d = u.def, k = input.keys; computeAim();
  if (d.heli) {                        // W/S forward-back, A/D strafe, E/Q climb-descend; nose follows the camera
    const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), st = (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0), up = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
    u.hv.set((sy * f + cy * st) * d.speed, up * d.speed * 0.5, (cy * f - sy * st) * d.speed); u.aimYaw = camYaw;
  } else if (d.domain === 'air') {
    u.steer.copy(aimDir);
    if (k.KeyW) u.throttleT = Math.min(1.2, u.throttleT + dt * 0.5);
    if (k.KeyS) u.throttleT = Math.max(0.55, u.throttleT - dt * 0.5);
  } else {
    u.throttle = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0); u.turnIn = (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0);
    u.aimYaw = Math.atan2(aimPoint.x - u.pos.x, aimPoint.z - u.pos.z);
  }
  if (input.fire) fireGun(u, aimPoint, 0);
  if (k.Space) fireAlt(u, aimPoint);
}
function updateCamera(dt) {
  if (state === 'menu') {
    const a = performance.now() * 0.00006, q = selCol < 0 ? ENG[1] : PT(selCol, 1); camera.position.set(q.x + Math.sin(a) * 380, q.y + 150, q.z + Math.cos(a) * 380);
    camera.lookAt(q.x, q.y + 10, q.z); return;
  }
  if (!focusMesh) return;
  const d = focusDef; fov += ((input.zoom ? 17 : 60) - fov) * Math.min(1, dt * 10);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const lim = d.domain === 'air' && !d.heli ? 1.3 : 1.0; camPitch = clamp(camPitch, -lim, lim);
  fwd(camYaw, camPitch, aimDir);
  const p = focusMesh.position; camera.position.set(p.x, p.y + d.camH, p.z).addScaledVector(aimDir, -d.camDist);
  const g = ground(camera.position.x, camera.position.z) + 1.5; if (camera.position.y < g) camera.position.y = g;
  T1.copy(camera.position).addScaledVector(aimDir, 100); camera.lookAt(T1);
}

// -------------------------------------------------------------- shop & menus
let shopTab = 'Air';
function statLine(d) {
  if (d.domain === 'bld') return `${d.people} ${d.job}` + (d.perHead ? ` · +$${d.people * d.perHead} every ${INCOME_PERIOD}s` : '') + ` · ${d.hp} HP`;
  return `${d.hp} HP · speed ${d.speed}` + (d.gun ? ` · gun ${d.gun.dmg}` : '') + (d.alt ? ` · ${d.alt.label}` : '') + (d.pay ? ` · pays $${d.pay} a trip` : '');
}
function renderShop() {
  $('shopMoney').textContent = '$' + Math.floor(money).toLocaleString();
  const tabs = $('tabs'); tabs.innerHTML = '';
  for (const t of Object.keys(SHOP)) {
    const b = document.createElement('button'); b.className = 'tab' + (t === shopTab ? ' on' : ''); b.textContent = t;
    b.onclick = () => { shopTab = t; renderShop(); }; tabs.append(b);
  }
  const box = $('shopCards'); box.innerHTML = '';
  const mobile = units.filter(u => u.team === ALLY && u.def.domain !== 'bld').length;
  for (const id of SHOP[shopTab]) {
    const d = DEFS[id], isB = d.domain === 'bld', nc = NONCOMBAT[d.role], own = isB || nc || Account.has(id);
    const full = isB ? !plots[ALLY].some(p => !p.unit) : mobile >= UNIT_CAP + 8;
    const can = own && money >= d.cost && !full;
    const c = document.createElement('div'); c.className = 'card' + (own && (can || (!isB && !nc)) ? '' : ' no'); c.style.cursor = 'default';
    const price = isB || nc ? '$' + d.cost.toLocaleString() : `TIER ${d.tier} · ${own ? 'UNLOCKED' : 'LOCKED'}`;
    c.innerHTML = `<div class="k">${isB ? 'Building' : d.heli ? 'helicopter' : d.role}</div><div class="t"></div><div class="d"></div><div class="s"></div><div class="p">${price}</div><div class="row"></div>`;
    c.querySelector('.t').textContent = d.name; c.querySelector('.s').textContent = statLine(d);
    c.querySelector('.d').textContent = !own ? `Unlock ${BRANCH[d.domain]} tier ${d.tier} in the Armory on the campaign map.` : full && (isB || nc) ? (isB ? 'No free building plots.' : 'Force limit reached.') : d.desc;
    const row = c.querySelector('.row');
    const mk = (label, alt, fn, on) => { const b = document.createElement('button'); b.className = 'btn' + (alt ? ' alt' : ''); b.textContent = label; b.disabled = !on; b.onclick = fn; row.append(b); };
    if (isB) mk('Build', false, () => buy(id, false), can);
    else if (nc) mk(d.role === 'lander' ? 'Send convoy' : 'Launch', false, () => buy(id, false), can);
    else if (own) {
      mk(deployCd > 0 ? `Deploy in ${Math.ceil(deployCd)}s` : 'Deploy · free', false, () => buy(id, true), deployCd <= 0);
      mk('Escort $' + d.cost.toLocaleString(), true, () => buy(id, false), can);
    }
    box.append(c);
  }
}
// Every vehicle in a tier you have unlocked is free to deploy in (and respawn in). Extra computer-flown escorts,
// supply vehicles and buildings are paid for from this battle's war chest.
function buy(id, command) {
  const d = DEFS[id], nc = NONCOMBAT[d.role], isB = d.domain === 'bld';
  if (!isB && !nc && !Account.has(id)) return;
  if (command && !isB && !nc) { deploy(id); return; }
  if (money < d.cost) return;
  if (isB) { const u = build(ALLY, id); if (!u) return; money -= d.cost; msg(`Construction started: ${d.name}`, 'good'); renderShop(); return; }
  money -= d.cost;
  if (nc) {
    if (d.role === 'lander') { sealift(ALLY, d.cargo.slice()); msg(`${d.name} convoy is sailing in from the south`, 'good'); }
    else { spawnAt(id, ALLY); msg(`${d.name} has started its supply runs`, 'good'); }
    renderShop(); return;
  }
  if (d.domain === 'land') { airlift(ALLY, [id]); msg(`${d.name} is being flown in by cargo plane`, 'good'); }
  else { spawnAt(id, ALLY, selCol); msg(`${d.name} has joined the fight`, 'good'); }
  renderShop();
}
function toggleShop(on) {
  if (on && state === 'playing') { state = 'shop'; $('shop').classList.add('on'); if (document.exitPointerLock) document.exitPointerLock(); input.fire = false; input.zoom = false; renderShop(); }
  else if (!on && state === 'shop') { state = 'playing'; $('shop').classList.remove('on'); }
}
// ---- campaign map: shown before the battle, after losing a vehicle, and on M (paused)
function frontCol() { let c = 0; for (const p of POINTS) if (!p.eng && p.owner === ALLY) c = Math.max(c, p.col); return c; }
function canDeployIn(c) { return c <= 0 || POINTS.some(p => secOf(p) === c && p.owner === ALLY); }
function secPoints(c) { return POINTS.filter(p => secOf(p) === c); }
function openMenu() {
  if (!canDeployIn(selCol)) selCol = frontCol();
  $('menu').classList.add('on'); if (document.exitPointerLock) document.exitPointerLock(); input.fire = false; input.zoom = false; renderMenu();
}
function toggleMap(on) {
  if (on && state === 'playing') { state = 'map'; openMenu(); }
  else if (!on && state === 'map') { state = 'playing'; $('menu').classList.remove('on'); }
}
function renderMenu() {
  const a = Account.data, mode = state;
  $('menuTitle').textContent = mode === 'dead' ? 'Vehicle lost' : mode === 'map' ? 'Campaign map' : 'Frontline 1944';
  $('menuSub').textContent = mode === 'dead' ? 'The wreck stays where it fell. Pick a sector on the map and a vehicle to rejoin the battle.'
    : mode === 'map' ? 'The battle is paused. Redeploy to another sector, visit the Armory, or end the operation and bank your credits.'
      : 'Push the front line east, sector by sector, until the Axis headquarters falls. Click a sector on the map, then choose a vehicle.';
  $('acct').innerHTML = `<b>${a.credits.toLocaleString()}</b> credits` + (mode !== 'menu' ? ` <i>+${stats.credits.toLocaleString()} this battle</i>` : '') + `<small>${a.battles} battles · ${a.wins} won · ${a.kills} kills · ${a.campaigns} campaigns won</small>`;
  const sec = secPoints(selCol), held = sec.filter(p => p.owner === ALLY).length;
  $('sectorInfo').innerHTML = (selCol < 0 ? 'Deploying in <b>England</b>' : `Deploying in the <b>${SECTORS[selCol]}</b> sector`) + ` · ${held} of ${sec.length} points held` + (selCol === frontCol() ? ' · front line' : '') + (selCol < 0 ? ' · home runway and harbour' : '');
  const tabs = $('menuTabs'); tabs.innerHTML = '';
  for (const t of ['Deploy', 'Armory']) {
    const b = document.createElement('button'); b.className = 'tab' + (t === menuTab ? ' on' : ''); b.textContent = t;
    b.onclick = () => { menuTab = t; renderMenu(); }; tabs.append(b);
  }
  $('starters').style.display = menuTab === 'Deploy' ? '' : 'none'; $('armory').style.display = menuTab === 'Armory' ? '' : 'none';
  if (menuTab === 'Deploy') renderStarters(); else renderArmory();
  const row = $('menuBtns'); row.innerHTML = '';
  const mk = (label, alt, fn) => { const b = document.createElement('button'); b.className = 'btn' + (alt ? ' alt' : ''); b.textContent = label; b.onclick = fn; row.append(b); };
  if (mode === 'map') mk('Back to battle', false, () => toggleMap(false));
  if (mode !== 'menu') mk('End operation and bank credits', true, () => endBattle());
}
function renderStarters() {
  const box = $('starters'); box.innerHTML = '';
  const ids = SHOP.Air.concat(SHOP.Land, SHOP.Sea).filter(id => !NONCOMBAT[DEFS[id].role] && Account.has(id));
  if (!ids.includes(lastBought)) lastBought = ids[0];
  const wait = state === 'map' && deployCd > 0;
  for (const id of ids) {
    const d = DEFS[id], c = document.createElement('button'); c.className = 'card' + (id === lastBought ? ' def' : '') + (wait ? ' no' : '');
    c.innerHTML = `<div class="k">${BRANCH[d.domain]} · tier ${d.tier}${id === lastBought && state === 'dead' ? ' · press Enter' : ''}</div><div class="t"></div><div class="d"></div><div class="s"></div>`;
    c.querySelector('.t').textContent = d.name; c.querySelector('.d').textContent = wait ? `Redeploy available in ${Math.ceil(deployCd)}s.` : d.desc; c.querySelector('.s').textContent = statLine(d);
    c.onclick = () => deploy(id); box.append(c);
  }
}
function renderArmory() {
  const box = $('armory'); box.innerHTML = '';
  for (const br of ['air', 'land', 'sea']) {
    const t = Account.tier(br), col = document.createElement('div'); col.className = 'arm';
    col.innerHTML = `<div class="k">${BRANCH[br]} forces</div><div class="t">Tier ${t} of ${MAX_TIER}</div>`;
    for (let n = 1; n <= MAX_TIER; n++) {
      const names = SHOP[BRANCH[br]].filter(id => DEFS[id].tier === n && !NONCOMBAT[DEFS[id].role]).map(id => DEFS[id].name).join(', ');
      const r = document.createElement('div'); r.className = 'tier ' + (n <= t ? 'have' : n === t + 1 ? 'next' : 'lock');
      r.innerHTML = `<b>Tier ${n}${n <= t ? ' ✓' : ''}</b><span></span>`; r.querySelector('span').textContent = names;
      if (n === t + 1) {
        const b = document.createElement('button'); b.className = 'btn'; b.textContent = `Unlock · ${TIER_PRICE[n].toLocaleString()} credits`;
        b.disabled = Account.data.credits < TIER_PRICE[n]; b.onclick = () => { if (Account.unlock(br)) renderMenu(); }; r.append(b);
      }
      col.append(r);
    }
    box.append(col);
  }
  const note = document.createElement('div'); note.className = 'note';
  note.textContent = 'Unlocks are permanent. Credits are paid out when a battle ends. The Axis field the same tiers you have unlocked, so the war escalates with you.';
  box.append(note);
}
// take command of a vehicle in the selected sector: free in any unlocked tier
function deploy(id) {
  if (!Account.has(id) || NONCOMBAT[DEFS[id].role] || state === 'over') return;
  const first = state === 'menu', redeploy = state === 'map' || state === 'shop';
  if (redeploy && deployCd > 0) return;
  initAudio();
  const old = player, u = spawnAt(id, ALLY, selCol); u.mine = true; setPlayer(u); lastBought = id;
  if (old && old.mine && !old.dead) despawn(old);        // your previous personal vehicle is withdrawn
  if (redeploy) deployCd = 20;
  state = 'playing'; $('menu').classList.remove('on'); $('shop').classList.remove('on'); $('hud').style.display = 'block';
  if (first) { const s = World.info; banner(secName(selCol) + (selCol < 0 ? '' : ' sector'), `${s.name}. ${s.desc}`); } else msg(`Deployed in ${DEFS[id].name}, ${secName(selCol)}`, 'good');
  const cv = renderer.domElement; if (!touchMode && cv.requestPointerLock) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } }
}
const startAs = deploy;
function showRespawn() { openMenu(); }
// A battle ends when the clock runs out, when you end the operation, or when a headquarters falls ('won' / 'lost').
// Credits are banked here; the state of the front is saved so the next battle carries on from it.
function endBattle(result) {
  if (state === 'over') return; state = 'over';
  $('menu').classList.remove('on'); $('shop').classList.remove('on'); if (document.exitPointerLock) document.exitPointerLock();
  const gain = allyOwned() - startOwned, win = result === 'won' || (!result && gain > 0);
  const rows = [[`Enemies destroyed (${stats.kills})`, stats.killCr], [`Points captured in person (${stats.capCr / 250})`, stats.capCr], ['Battle pay', 300]];
  if (gain > 0) rows.push([`Front line advanced (${gain} point${gain > 1 ? 's' : ''})`, gain * 150]);
  if (result === 'won') rows.push(['Campaign victory', 3000]);
  const total = rows.reduce((t, r) => t + r[1], 0);
  Account.reward({ credits: total, kills: stats.kills, win, campaignWon: result === 'won', owners: result ? null : POINTS.map(p => p.owner) });
  $('overTitle').textContent = result === 'won' ? 'Campaign won' : result === 'lost' ? 'Campaign lost' : gain > 0 ? 'Ground gained' : gain < 0 ? 'Ground lost' : 'Stalemate';
  $('overSub').textContent = result === 'won' ? 'The Axis headquarters is rubble. A new campaign begins, and you keep everything you have unlocked.'
    : result === 'lost' ? 'Allied headquarters has fallen. The campaign starts over, but your unlocks and credits are safe.'
      : `The operation is over. The Allies hold ${allyOwned()} of ${POINTS.length} points; the front stays where you left it for the next battle.`;
  const box = $('overRows'); box.innerHTML = '';
  for (const r of rows.concat([['Credits earned', total], ['Credits in the bank', Account.data.credits]])) {
    const a = document.createElement('span'), b = document.createElement('b'); a.textContent = r[0]; b.textContent = (r[0] === 'Credits in the bank' ? '' : '+') + r[1].toLocaleString(); box.append(a, b);
  }
  setTimeout(() => $('over').classList.add('on'), result ? 2500 : 500);
}
// -------------------------------------------------------------- HUD
let ovCtx, miniCtx, miniBg;
function drawOverlay() {
  const cv = $('ov'), w = cv.width, h = cv.height, c = ovCtx; c.clearRect(0, 0, w, h);
  if (state !== 'playing' && state !== 'dead') { zoomTarget = null; return; }
  zoomTarget = null;
  if (input.zoom && player) zoomTarget = nearestToReticle(0.1);
  for (const u of units) {
    if (u === player) continue;
    const dist = u.pos.distanceTo(camera.position), maxD = (u.def.domain === 'bld' ? 1100 : 2000) * World.vis;
    if (dist > maxD) continue;
    if (u.team === AXIS && u.def.sub && u.dive > 0.5 && dist > 450) continue;
    T1.copy(u.pos); T1.y += (u.def.centerY || 0) + (u.def.len ? u.def.beam * 1.6 : u.def.radius * 0.9) + 3; T1.project(camera);
    if (T1.z > 1 || Math.abs(T1.x) > 1 || Math.abs(T1.y) > 1) continue;
    const sx = (T1.x + 1) / 2 * w, sy = (1 - T1.y) / 2 * h, en = u.team === AXIS, s = u === zoomTarget ? 8 : 5;
    c.fillStyle = en ? '#ff5a4d' : '#5b93ff'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1;
    c.beginPath();
    if (en) { c.moveTo(sx, sy - s); c.lineTo(sx + s, sy); c.lineTo(sx, sy + s); c.lineTo(sx - s, sy); }
    else { c.moveTo(sx - s, sy - s * 0.7); c.lineTo(sx + s, sy - s * 0.7); c.lineTo(sx, sy + s * 0.8); }
    c.closePath(); c.fill(); c.stroke();
    if (dist < 420 || u === zoomTarget) {
      const bw = 34; c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(sx - bw / 2, sy - s - 8, bw, 4);
      c.fillStyle = en ? '#ff5a4d' : '#7fd66a'; c.fillRect(sx - bw / 2, sy - s - 8, bw * clamp(u.hp / u.maxHp, 0, 1), 4);
    }
  }
  c.font = '700 11px "Trebuchet MS",sans-serif'; c.textAlign = 'center';
  for (const p of POINTS) {                // capture point markers
    T1.set(p.x, p.y + 75, p.z); const dist = T1.distanceTo(camera.position); if (dist > 5200) continue;
    T1.project(camera); if (T1.z > 1 || Math.abs(T1.x) > 1 || Math.abs(T1.y) > 1) continue;
    const sx = (T1.x + 1) / 2 * w, sy = (1 - T1.y) / 2 * h;
    c.fillStyle = p.owner < 0 ? '#f2f0e0' : p.owner === ALLY ? '#5b93ff' : '#ff5a4d'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(sx - 5, sy - 12); c.lineTo(sx + 9, sy - 7); c.lineTo(sx - 5, sy - 2); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(sx - 5, sy - 13); c.lineTo(sx - 5, sy + 4); c.stroke();
    const label = p.name + ' · ' + (dist * 3 > 5000 ? (dist * 3 / 5280).toFixed(1) + ' mi' : Math.round(dist * 3 / 10) * 10 + ' ft');
    c.lineWidth = 3; c.strokeText(label, sx, sy + 17); c.fillStyle = '#f4f1e2'; c.fillText(label, sx, sy + 17);
    if (p.prog) { const bw = 46; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(sx - bw / 2, sy + 22, bw, 5); c.fillStyle = p.prog > 0 ? '#5b93ff' : '#ff5a4d'; c.fillRect(sx - bw / 2, sy + 22, bw * Math.min(1, Math.abs(p.prog)), 5); }
  }
  if (state === 'playing') {
    const cx = w / 2, cy = h / 2, r = input.zoom ? 26 : 14;
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 4; ret(c, cx, cy, r); c.strokeStyle = zoomTarget ? '#ff7a6a' : '#f2c14e'; c.lineWidth = 1.8; ret(c, cx, cy, r);
    c.fillStyle = c.strokeStyle; c.fillRect(cx - 1, cy - 1, 2, 2);
  }
  if (hurtFlash > 0) { c.fillStyle = `rgba(255,40,20,${hurtFlash * 0.7})`; c.fillRect(0, 0, w, h); }
  if (nukeFlash > 0) { c.fillStyle = `rgba(255,252,235,${Math.min(1, nukeFlash)})`; c.fillRect(0, 0, w, h); }
}
function ret(c, x, y, r) {
  c.beginPath(); c.arc(x, y, r, 0, 6.283); c.stroke(); c.beginPath();
  c.moveTo(x - r - 8, y); c.lineTo(x - r * 0.45, y); c.moveTo(x + r * 0.45, y); c.lineTo(x + r + 8, y);
  c.moveTo(x, y - r - 8); c.lineTo(x, y - r * 0.45); c.moveTo(x, y + r * 0.45); c.lineTo(x, y + r + 8); c.stroke();
}
// shared map drawing: a pre-rendered picture of the whole theatre, the front line, capture points and units
let mapBgCv = null, campCtx = null;
function mapBg() {
  if (mapBgCv) return mapBgCv;
  const w = 1400, h = 750; mapBgCv = document.createElement('canvas'); mapBgCv.width = w; mapBgCv.height = h; const b = mapBgCv.getContext('2d');
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const t = terrainH((x / w * 2 - 1) * MAP.x, (y / h * 2 - 1) * MAP.z);
    b.fillStyle = t > 9 ? '#4f6b3c' : t > 0.5 ? '#46663a' : t > -3 ? '#8a8560' : t > -14 ? '#1c4a66' : '#17405a'; b.fillRect(x, y, 2, 2);
  }
  return mapBgCv;
}
function drawFrontLine(c, X, Z, lw) {
  const path = frontPath();
  c.beginPath(); path.forEach((q, i) => c[i ? 'lineTo' : 'moveTo'](X(q[0]), Z(q[1])));
  c.lineJoin = 'round'; c.strokeStyle = 'rgba(0,0,0,.65)'; c.lineWidth = lw + 2; c.stroke();
  c.setLineDash([7, 5]); c.strokeStyle = '#ffd24a'; c.lineWidth = lw; c.stroke(); c.setLineDash([]);
}
function drawPointDots(c, X, Z, r, names) {
  for (const p of POINTS) {
    const x = X(p.x), z = Z(p.z);
    c.beginPath(); c.arc(x, z, r, 0, 6.3); c.fillStyle = p.owner < 0 ? '#f2f0e0' : p.owner === ALLY ? '#3f7dff' : '#f04a3c'; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = p.contest ? '#ffd24a' : '#101010'; c.stroke();
    if (p.prog) { c.beginPath(); c.arc(x, z, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.abs(p.prog) * 6.283); c.strokeStyle = p.prog > 0 ? '#9fc0ff' : '#ff9a8a'; c.lineWidth = 2.5; c.stroke(); }
    if (names) { c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(p.name, x, z + r + 13); c.fillStyle = '#f4f1e2'; c.fillText(p.name, x, z + r + 13); }
  }
}
function drawUnitDots(c, X, Z, k) {
  const fogR = 1500 * World.vis;
  for (const u of units) {
    if (u === player || u.def.model === 'outpost' || u.def.model === 'seafort') continue;
    if (u.team === AXIS && World.vis < 0.6 && focusMesh && hdist(u.pos, focusMesh.position) > fogR && u.def.domain !== 'bld') continue;
    if (u.team === AXIS && u.def.sub && u.dive > 0.5 && focusMesh && hdist(u.pos, focusMesh.position) > 450) continue;
    c.fillStyle = u.team === ALLY ? '#8fb8ff' : '#ff8a7a';
    const x = X(u.pos.x), z = Z(u.pos.z);
    if (u.def.model === 'airport') c.fillRect(x - 9 * k, z + 1, 18 * k, 2);
    if (u.def.domain === 'bld') { const q = (u.def.model === 'hq' ? 7 : 4) * k; c.fillRect(x - q / 2, z - q / 2, q, q); }
    else if (u.def.domain === 'air') { c.beginPath(); c.moveTo(x, z - 3 * k); c.lineTo(x + 3 * k, z + 2 * k); c.lineTo(x - 3 * k, z + 2 * k); c.fill(); }
    else { c.beginPath(); c.arc(x, z, (u.def.domain === 'sea' ? 3 : 2) * k, 0, 6.3); c.fill(); }
  }
}
// the corner map shows the ground around you; M opens the whole campaign
function drawMini() {
  const cv = $('mini'), w = cv.width, h = cv.height, c = miniCtx, bg = mapBg();
  const span = 1500, spanZ = span * h / w, f = focusMesh ? focusMesh.position : selCol < 0 ? ENG[1] : PT(selCol, 1);
  const cx = clamp(f.x, -MAP.x + span, MAP.x - span), cz = clamp(f.z, -MAP.z + spanZ, MAP.z - spanZ);
  const kx = bg.width / (2 * MAP.x), kz = bg.height / (2 * MAP.z);
  c.drawImage(bg, (cx - span + MAP.x) * kx, (cz - spanZ + MAP.z) * kz, 2 * span * kx, 2 * spanZ * kz, 0, 0, w, h);
  const X = x => (x - cx + span) / (2 * span) * w, Z = z => (z - cz + spanZ) / (2 * spanZ) * h;
  c.fillStyle = 'rgba(20,20,20,.8)'; for (const k of wrecks) c.fillRect(X(k.mesh.position.x) - 1, Z(k.mesh.position.z) - 1, 2, 2);
  c.fillStyle = '#fff'; for (const b of World.icebergs) if (b.k > 0.3) { c.beginPath(); c.arc(X(b.x), Z(b.z), 2, 0, 6.3); c.fill(); }
  drawFrontLine(c, X, Z, 1.5);
  c.font = '700 9px "Trebuchet MS",sans-serif'; c.textAlign = 'center';
  drawPointDots(c, X, Z, 5, true); drawUnitDots(c, X, Z, 1);
  if (focusMesh) {
    const p = focusMesh.position, x = X(p.x), z = Z(p.z);
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, z, 4, 0, 6.3); c.stroke();
    c.beginPath(); c.moveTo(x, z); c.lineTo(x + Math.sin(camYaw) * 12, z + Math.cos(camYaw) * 12); c.stroke();
  }
}
// ---- campaign map: the whole theatre from above, drawn from the same outlines the terrain is built from
const EU_LABELS = [['ENGLAND', -1.4, 52.4, 15], ['FRANCE', 2.6, 47.3, 15], ['GERMANY', 10.2, 50.6, 15], ['IRELAND', -8, 53.2, 12], ['English Channel', -2.6, 50.28, 10], ['North Sea', 3.2, 54.2, 12], ['Bay of Biscay', -5.5, 46.9, 10], ['Baltic', 14.6, 54.9, 10]];
let euBg = null;
function euXY(lon, lat, w, h) { return [(lon - EU.lon0) / (EU.lon1 - EU.lon0) * w, (EU.lat1 - lat) / (EU.lat1 - EU.lat0) * h]; }
function euWorld(x, z, w, h) { return [(x / MAP.x + 1) / 2 * w, (z / MAP.z + 1) / 2 * h]; }
function euLane(l, idx, w, h) { const q = lanePos(l, idx); return euWorld(q.x, q.z, w, h); }
function euPoint(p, w, h) { return euWorld(p.x, p.z, w, h); }
function euFront(l, w, h) { return euLane(l, frontIdx(l), w, h); }
function drawEuBg(w, h) {
  euBg = document.createElement('canvas'); euBg.width = w; euBg.height = h; const c = euBg.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#163a52'); g.addColorStop(1, '#1d4a66'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;                 // graticule
  for (let lon = -8; lon < 18; lon += 2) { const q = euXY(lon, 0, w, h); c.beginPath(); c.moveTo(q[0], 0); c.lineTo(q[0], h); c.stroke(); }
  for (let lat = 47; lat < 56; lat++) { const q = euXY(0, lat, w, h); c.beginPath(); c.moveTo(0, q[1]); c.lineTo(w, q[1]); c.stroke(); }
  const land = () => { for (const poly of EU_LAND) { c.beginPath(); poly.forEach((q, i) => { const r = euXY(q[0], q[1], w, h); c[i ? 'lineTo' : 'moveTo'](r[0], r[1]); }); c.closePath(); c.fill(); c.stroke(); } };
  c.lineJoin = 'round'; c.fillStyle = 'rgba(120,170,190,.25)'; c.strokeStyle = 'rgba(120,170,190,.25)'; c.lineWidth = 9; land();   // shallows
  c.fillStyle = '#4b6a3d'; c.strokeStyle = '#c9c08f'; c.lineWidth = 1.5; land();
  const R = rng32(1944);
  for (let i = 0; i < 2600; i++) { c.fillStyle = R() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,220,.04)'; c.fillRect(R() * w, R() * h, 2 + R() * 3, 2 + R() * 3); }
  c.textAlign = 'center';
  for (const L of EU_LABELS) {
    const q = euXY(L[1], L[2], w, h), sea = L[3] < 13 && L[0] !== 'IRELAND';
    c.font = (sea ? 'italic ' : '700 ') + L[3] + 'px "Trebuchet MS",sans-serif'; c.fillStyle = sea ? 'rgba(170,205,225,.6)' : 'rgba(20,30,15,.45)';
    c.fillText(sea ? L[0] : L[0].split('').join(' '), q[0], q[1]);
  }
}
function drawCamp() {
  const cv = $('camp'), w = cv.width, h = cv.height, c = campCtx;
  if (!euBg) drawEuBg(w, h);
  c.drawImage(euBg, 0, 0);
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let l = 0; l < LANES; l++) {        // ground held: each lane washed in its owner's colour up to the front
    const f = frontIdx(l);
    for (const side of [0, 1]) {
      c.beginPath(); const from = side ? f : 0, to = side ? COLS + 1 : f;
      for (let k = 0; k <= 24; k++) { const q = euLane(l, from + (to - from) * k / 24, w, h); c[k ? 'lineTo' : 'moveTo'](q[0], q[1]); }
      c.strokeStyle = side ? 'rgba(240,60,45,.3)' : 'rgba(60,125,255,.34)'; c.lineWidth = 30; c.stroke();
    }
  }
  const sp = secPoints(selCol).map(p => euPoint(p, w, h));   // the sector you will deploy in
  c.beginPath(); sp.forEach((q, i) => c[i ? 'lineTo' : 'moveTo'](q[0], q[1]));
  c.strokeStyle = 'rgba(242,193,78,.4)'; c.lineWidth = 40; c.stroke(); c.strokeStyle = '#f2c14e'; c.lineWidth = 2; c.stroke();
  const f0 = euFront(0, w, h), f1 = euFront(1, w, h), f2 = euFront(2, w, h);   // the front line, from the sea to deep inland
  const path = [[f2[0] + (f2[0] - f1[0]) * 0.8, f2[1] + (f2[1] - f1[1]) * 0.8], f2, f1, f0, [f0[0] + (f0[0] - f1[0]) * 0.8, f0[1] + (f0[1] - f1[1]) * 0.8]];
  c.beginPath(); path.forEach((q, i) => c[i ? 'lineTo' : 'moveTo'](q[0], q[1]));
  c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 6; c.stroke(); c.setLineDash([9, 7]); c.strokeStyle = '#ffd24a'; c.lineWidth = 3; c.stroke(); c.setLineDash([]);
  if (calaisHeld()) {                      // the invasion route across the strait
    const a = euPoint(PT(4, 1), w, h), b = euPoint(ENG[ENG.length - 1], w, h);
    c.setLineDash([3, 5]); c.strokeStyle = '#ff8a7a'; c.lineWidth = 2; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.setLineDash([]);
  }
  c.textAlign = 'center';
  const text = (t, x, y, col) => { c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(t, x, y); c.fillStyle = col || '#f4f1e2'; c.fillText(t, x, y); };
  c.font = '700 11px "Trebuchet MS",sans-serif';
  for (const team of [ALLY, AXIS]) {
    const q = euWorld(BASE[team].x, BASE[team].z, w, h);
    c.fillStyle = team === ALLY ? '#3f7dff' : '#f04a3c'; c.strokeStyle = '#101010'; c.lineWidth = 1.5; c.fillRect(q[0] - 9, q[1] - 9, 18, 18); c.strokeRect(q[0] - 9, q[1] - 9, 18, 18);
    c.fillStyle = '#fff'; c.fillText('HQ', q[0], q[1] + 4);
    text(team === ALLY ? 'Allied HQ' : 'Axis HQ · Berlin', q[0], q[1] - 15);
  }
  if (state !== 'menu') for (const u of units) {
    if (u === player || u.def.domain === 'bld') continue;
    if (u.team === AXIS && u.def.sub && u.dive > 0.5) continue;
    const q = euWorld(u.pos.x, u.pos.z, w, h); c.fillStyle = u.team === ALLY ? '#bcd4ff' : '#ffb3a8'; c.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3);
  }
  for (const p of POINTS) {
    const q = euPoint(p, w, h), r = p.lane === 1 ? 8 : p.eng ? 7 : 6;
    c.beginPath(); c.arc(q[0], q[1], r, 0, 6.3); c.fillStyle = p.owner < 0 ? '#f2f0e0' : p.owner === ALLY ? '#3f7dff' : '#f04a3c'; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = p.contest ? '#ffd24a' : '#101010'; c.stroke();
    if (p.prog) { c.beginPath(); c.arc(q[0], q[1], r + 3, -Math.PI / 2, -Math.PI / 2 + Math.abs(p.prog) * 6.283); c.strokeStyle = p.prog > 0 ? '#9fc0ff' : '#ff9a8a'; c.lineWidth = 2.5; c.stroke(); }
    c.font = (p.lane === 1 ? '700 12px' : '700 10px') + ' "Trebuchet MS",sans-serif';
    if (p.lane === 1) text(SECTORS[p.col], q[0], q[1] + r + 13, p.col === selCol ? '#f2c14e' : canDeployIn(p.col) ? '#f4f1e2' : 'rgba(244,241,226,.65)');
    else if (p.eng) text(p.name, q[0], q[1] - r - 5, selCol < 0 ? '#f2c14e' : '#f4f1e2');
    else if (p.col === selCol) text(p.name, q[0], q[1] + (p.lane ? -r - 5 : r + 12));
  }
  if (state !== 'menu' && focusMesh) { const q = euWorld(focusMesh.position.x, focusMesh.position.z, w, h); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(q[0], q[1], 7, 0, 6.3); c.stroke(); }
}
function updateHUD(dt) {
  if (hurtFlash > 0) hurtFlash -= dt;
  if (nukeFlash > 0) nukeFlash -= dt * 0.6;
  hudT -= dt; if (hudT > 0) return; hudT = 0.12;
  if (touchMode) $('tZoom').classList.toggle('on', input.zoom);
  $('money').textContent = '$' + Math.floor(money).toLocaleString();
  const bt = Math.max(0, Math.ceil(battleT));
  $('battle').textContent = `Operation ends in ${Math.floor(bt / 60)}:${('0' + bt % 60).slice(-2)} · +${stats.credits.toLocaleString()} credits`;
  const inc = incomeOf(ALLY);
  $('income').textContent = `+$${inc} every ${INCOME_PERIOD}s from buildings`;
  const s = World.info;
  $('season').textContent = `${s.icon} ${s.name}`; $('seasonDesc').textContent = s.desc;
  $('seasonBar').style.width = (World.remaining / SEASON_LEN * 100) + '%';
  const wx = $('wx'); wx.className = { Summer: 'heat', Fall: 'fog', Winter: 'snow', 'Rainy Season': 'rain' }[s.name];
  let workers = 0, residents = 0, gunners = 0, sailors = 0, merch = 0, fac = 0, hou = 0;
  for (const u of units) {
    if (u.team !== ALLY) continue; const d = u.def;
    if (d.domain === 'bld') { if (u.built < 1) continue; if (d.job === 'workers') { workers += d.people; if (d.model === 'factory') fac++; } else if (d.job === 'residents') { residents += d.people; hou++; } else if (d.job === 'gunners') gunners += d.people; }
    else if (d.domain === 'sea') { sailors += d.crew; if (d.role === 'merchant') merch++; if (d.aa) gunners += Math.round(d.crew * 0.1); }
    else if (d.aa) gunners += d.crew - 2;
  }
  $('people').innerHTML = `<span>Factory workers (${fac} factories)</span><b>${workers}</b><span>Residents paying bills (${hou} houses)</span><b>${residents}</b><span>Sailors at sea (${merch} merchants)</span><b>${sailors.toLocaleString()}</b><span>Gunners on duty</span><b>${gunners}</b>`;
  const m = $('morale');
  if (s.reload > 1) { m.textContent = 'Crew morale: soaked and grumbling (reloads 35% slower)'; m.style.color = '#9fc4e0'; }
  else { m.textContent = 'Crew morale: steady'; m.style.color = '#b9d48a'; }
  const u = player;
  if (u) {
    const d = u.def;
    $('hp').firstElementChild.style.width = clamp(u.hp / u.maxHp * 100, 0, 100) + '%';
    $('hp').firstElementChild.style.background = u.hp < u.maxHp * 0.3 ? '#ff5a4d' : u.hp < u.maxHp * 0.6 ? '#f2c14e' : '#6fcf5a';
    let st = `HP ${Math.max(0, Math.ceil(u.hp))}/${u.maxHp} · ${Math.round(Math.abs(u.speed) * 2.2)} mph`;
    if (d.sub) st += u.dive > 0.5 ? ' · SUBMERGED' : ' · surfaced';
    if (d.domain === 'air') st += ` · alt ${Math.round((u.pos.y - ground(u.pos.x, u.pos.z)) * 3)} ft · throttle ${Math.round(u.throttleT * 100)}%`;
    $('vstat').textContent = st;
    if (d.gun) $('w1').style.width = clamp(1 - u.cdGun / (d.gun.rate * World.reload), 0, 1) * 100 + '%';
    if (d.alt) $('w2').style.width = clamp(1 - u.cdAlt / (d.alt.cd * World.reload), 0, 1) * 100 + '%';
  }
  let cp = null; const capEl = $('cap');
  if (u && state === 'playing') for (const p of POINTS) if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < (p.sea ? CAP_R_SEA : CAP_R) + 40) cp = p;
  if (cp) {
    const fits = cp.sea ? u.def.domain === 'sea' : u.def.domain === 'land';
    let txt, k = 0;
    if (cp.post) txt = cp.owner === ALLY ? `${cp.name} · held by the Allies` : `${cp.name} · destroy the Axis command post to open it for capture`;
    else if (!fits) txt = `${cp.name} · open: only ${cp.sea ? 'warships' : 'ground forces'} can capture it`;
    else if (cp.contest) txt = `${cp.name} · contested! Clear the enemy out`;
    else if (!canCap(cp, ALLY)) txt = `${cp.name} · cut off: take ${(cp.eng ? ENG[cp.col - 1] : PT(cp.col - 1, cp.lane)).name} first`;
    else { txt = `Capturing ${cp.name}`; k = Math.max(0, cp.prog); }
    capEl.style.display = 'block'; $('capTxt').textContent = txt; $('capBar').style.width = k * 100 + '%'; $('capBar').parentNode.style.display = k > 0 || txt.startsWith('Capturing') ? '' : 'none';
  } else capEl.style.display = 'none';
  const tp = $('target');
  if (zoomTarget && !zoomTarget.dead) {
    tp.style.display = 'block'; const d = zoomTarget.def;
    $('tkind').textContent = 'Axis ' + ({ air: 'aircraft', land: 'ground unit', sea: 'vessel', bld: 'building' }[d.domain]);
    $('tname').textContent = d.name; $('thp').firstElementChild.style.width = clamp(zoomTarget.hp / zoomTarget.maxHp * 100, 0, 100) + '%';
    $('tdist').textContent = Math.round(zoomTarget.pos.distanceTo(focusMesh.position) * 3) + ' ft';
  } else tp.style.display = 'none';
}

// -------------------------------------------------------------- setup & loop
function setupTeams() {
  setupPoints();
  for (const team of [ALLY, AXIS]) {
    const b = BASE[team], s = team === ALLY ? 1 : -1;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) plots[team].push({ x: b.x + (c - 2) * 46 - s * 10, z: b.z + (r - 1.5) * 46, unit: null, rubble: null });
    // interleave so early buildings spread out
    plots[team].sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z));
    spawn('hq', team, b.x - s * 170, b.z, { yaw: s * Math.PI / 2 });
    spawn('dock', team, HOME[team].dock.x, HOME[team].dock.z, { yaw: HOME[team].dockYaw });
    spawn('airport', team, AIRPORT[team].x, AIRPORT[team].z - 45, { yaw: 0 });
    for (const id of ['factory', 'house', 'house', 'aagun', 'aagun']) build(team, id, true);
    const ids = team === ALLY ? ['spitfire', 'spitfire', 'mustang', 'r4', 'c47', 'troops', 'troops', 'troops', 'jeep', 'sherman', 'sherman', 'halftrack', 'truck', 'truck', 'ward', 'ward', 'pt', 'gato', 'atlanta', 'liberty', 'liberty']
      : ['bf109', 'bf109', 'fw190', 'fa223', 'ju52', 'grenadier', 'grenadier', 'grenadier', 'kubel', 'panzer4', 'panzer4', 'flakwagen', 'opel', 'opel', 'z23', 'z23', 'sboot', 'uboat', 'hipper', 'freighter', 'freighter'];
    // both armies are limited to the tiers the player has unlocked: anything above that is swapped for the basic type
    const basic = team === ALLY ? { air: 'spitfire', land: 'troops', sea: 'ward' } : { air: 'bf109', land: 'grenadier', sea: 'z23' };
    for (const id of ids) spawnAt(Account.has(id) ? id : basic[DEFS[id].domain], team);
    if (team === ALLY) for (let i = 0; i < 2; i++) spawnAt('troops', ALLY, -1);      // the garrison of England
  }
}
function update(dt) {
  time += dt; World.update(dt); if (deployCd > 0) deployCd -= dt;
  playerControl(dt);
  for (const u of units.slice()) updateUnit(u, dt);
  separation(); icebergHits(dt);
  updateProjs(dt); updateWrecks(dt); updateFx(dt);
  commander(ALLY, dt); commander(AXIS, dt); raids(dt); economy(dt);
  if (state !== 'over') { updatePoints(dt); battleT -= dt; if (battleT <= 0) endBattle(); }
  if (state === 'dead') { deadT -= dt; if (deadT <= 0 && !$('menu').classList.contains('on')) showRespawn(); }
}
let lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;
  if (state === 'playing' || state === 'dead' || state === 'over') update(dt);
  updateCamera(dt); World.render(dt, camera, now / 1000);
  renderer.render(scene, camera);
  drawOverlay(); drawMini(); updateHUD(dt);
  if ($('menu').classList.contains('on')) drawCamp();
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  const o = $('ov'); o.width = innerWidth; o.height = innerHeight;
  document.body.classList.toggle('compact', touchMode || innerWidth < 820 || innerHeight < 520);
}
// ---- touch controls: left thumb drives, right thumb aims, on-screen buttons do the rest
function setTouchMode() {
  if (touchMode) return; touchMode = true;
  document.body.classList.add('touch'); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); resize();
}
function bindTouch() {
  const cv = renderer.domElement, stick = $('stick'), knob = stick.firstElementChild, look = {};
  let stickId = null, sx = 0, sy = 0;
  const live = () => state === 'playing' || state === 'dead';
  const setStick = (dx, dy) => {
    const k = input.keys; k.KeyW = dy < -0.3; k.KeyS = dy > 0.3; k.KeyA = dx < -0.35; k.KeyD = dx > 0.35;
    knob.style.transform = `translate(${dx * 34}px,${dy * 34}px)`;
  };
  const endStick = () => { stickId = null; setStick(0, 0); stick.classList.remove('on'); stick.style.left = ''; stick.style.top = ''; stick.style.bottom = ''; };
  cv.addEventListener('touchstart', e => {
    e.preventDefault(); setTouchMode(); if (!live()) return;
    for (const t of e.changedTouches) {
      if (stickId === null && t.clientX < innerWidth * 0.42 && t.clientY > innerHeight * 0.35) {
        stickId = t.identifier; sx = t.clientX; sy = t.clientY; stick.classList.add('on');
        stick.style.left = (sx - 56) + 'px'; stick.style.top = (sy - 56) + 'px'; stick.style.bottom = 'auto';
      } else look[t.identifier] = { x: t.clientX, y: t.clientY };
    }
  }, { passive: false });
  addEventListener('touchmove', e => {
    if (e.target === cv || (e.target.closest && e.target.closest('#touch'))) e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { let dx = (t.clientX - sx) / 46, dy = (t.clientY - sy) / 46; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } setStick(dx, dy); continue; }
      const l = look[t.identifier]; if (!l || !live()) continue;
      const s = 0.0052 * (fov / 60);
      camYaw -= (t.clientX - l.x) * s; camPitch = clamp(camPitch - (t.clientY - l.y) * s, -1.3, 1.3); l.x = t.clientX; l.y = t.clientY;
    }
  }, { passive: false });
  const end = e => { for (const t of e.changedTouches) { if (t.identifier === stickId) endStick(); delete look[t.identifier]; } };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  // a button that is held: touch (the Fire button also aims while dragged) or mouse
  const hold = (id, down, up, aim) => {
    const el = $(id);
    el.addEventListener('touchstart', e => { e.preventDefault(); setTouchMode(); const t = e.changedTouches[0]; if (aim) look[t.identifier] = { x: t.clientX, y: t.clientY }; el.classList.add('on'); down(); }, { passive: false });
    const off = e => { e.preventDefault(); el.classList.remove('on'); if (up) up(); };
    el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
    el.addEventListener('mousedown', e => { e.preventDefault(); down(); });
    if (up) { el.addEventListener('mouseup', up); el.addEventListener('mouseleave', up); }
  };
  hold('tFire', () => { if (state === 'playing') input.fire = true; }, () => { input.fire = false; }, true);
  hold('tAlt', () => { input.keys.Space = true; }, () => { input.keys.Space = false; });
  hold('tUp', () => { input.keys.KeyE = true; }, () => { input.keys.KeyE = false; });
  hold('tDown', () => { input.keys.KeyQ = true; }, () => { input.keys.KeyQ = false; });
  const tap = (id, fn) => { const el = $(id); el.addEventListener('touchstart', e => { e.preventDefault(); setTouchMode(); fn(); }, { passive: false }); el.addEventListener('mousedown', e => { e.preventDefault(); fn(); }); };
  tap('tZoom', () => { if (state !== 'playing') return; input.zoom = !input.zoom; if (input.zoom) snapZoom(); });
  tap('tDive', toggleDive);
  tap('tShop', () => toggleShop(true));
  tap('tMap', () => toggleMap(true));
  tap('tSwitch', switchVehicle);
  $('shopClose').onclick = () => toggleShop(false);
  if ((window.matchMedia && matchMedia('(pointer: coarse)').matches) || /[?&]touch\b/.test(location.search)) setTouchMode();
}
function bindInput() {
  const cv = renderer.domElement;
  cv.addEventListener('mousedown', e => {
    if (state !== 'playing') return;
    if (document.pointerLockElement !== cv && cv.requestPointerLock) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (err) { } }
    if (e.button === 0) input.fire = true;
    if (e.button === 2) { input.zoom = true; snapZoom(); }
  });
  addEventListener('mouseup', e => { if (touchMode && e.target.closest && e.target.closest('#touch')) return; if (e.button === 0) input.fire = false; if (e.button === 2) input.zoom = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    if (state !== 'playing' && state !== 'dead') return;
    const s = 0.0023 * (fov / 60);
    camYaw -= (e.movementX || 0) * s; camPitch = clamp(camPitch - (e.movementY || 0) * s, -1.3, 1.3);
  });
  addEventListener('keydown', e => {
    if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) switchVehicle(); return; }
    if (e.code === 'KeyB' && !e.repeat) { toggleShop(state !== 'shop'); return; }
    if (e.code === 'KeyM' && !e.repeat) { toggleMap(state !== 'map'); return; }
    if (e.code === 'Escape') { toggleShop(false); toggleMap(false); return; }
    if (e.code === 'Enter' && state === 'dead' && $('menu').classList.contains('on')) { deploy(lastBought); return; }
    if (e.code === 'KeyC' && !e.repeat) toggleDive();
    if (e.code === 'Space') e.preventDefault();
    input.keys[e.code] = true;
  });
  addEventListener('keyup', e => { input.keys[e.code] = false; });
  addEventListener('blur', () => { input.keys = {}; input.fire = false; input.zoom = false; });
  addEventListener('resize', resize);
}
function init() {
  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 11000);
  ovCtx = $('ov').getContext('2d'); miniCtx = $('mini').getContext('2d'); campCtx = $('camp').getContext('2d');
  World.init(scene);
  World.onSeason = s => { banner(s.name, s.desc); msg(`Season change: ${s.name}. ${s.desc}.`); };
  setupTeams(); bindInput(); bindTouch(); resize();
  selCol = frontCol();
  $('camp').addEventListener('click', e => {
    const cv = e.currentTarget, r = cv.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * cv.width, my = (e.clientY - r.top) / r.height * cv.height;
    let c = 0, bd = 1e9;                   // the sector whose nearest point is closest to the click
    for (const p of POINTS) { const q = euPoint(p, cv.width, cv.height), dd = Math.hypot(q[0] - mx, q[1] - my); if (dd < bd) { bd = dd; c = secOf(p); } }
    if (canDeployIn(c)) { selCol = c; renderMenu(); }
    else $('sectorInfo').innerHTML = `The <b>${secName(c)}</b> sector is not in Allied hands: you can only deploy where the Allies hold a point.`;
  });
  $('resetLink').onclick = () => { if (confirm('Start again from scratch? Every unlock, credit and the campaign map is lost.')) { Account.reset(); location.reload(); } };
  renderMenu();
  requestAnimationFrame(loop);
}
// debug / test handle
window.G = { units, wrecks, projs, World, step(n, dt) { for (let i = 0; i < n; i++) update(dt || 0.033); }, get player() { return player; }, get money() { return money; }, set money(v) { money = v; }, get state() { return state; }, startAs, deploy, buy, toggleShop, toggleMap, switchVehicle, damage, kill, spawnAt, spawn, airlift, sealift, requisition, setPlayer, Account, POINTS, PT, capture, endBattle, reach, stage, frontPos, ferry, ENG, engObjective, calaisHeld, navTo, sdf, get battleT() { return battleT; }, set battleT(v) { battleT = v; }, get selCol() { return selCol; }, set selCol(v) { selCol = v; }, stats, get lastBought() { return lastBought; }, get deployCd() { return deployCd; }, set deployCd(v) { deployCd = v; } };
init();

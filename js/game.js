'use strict';
// ====================================================================
//  Frontline 1944 - the screen: drawing the battle, sound, the HUD, menus and the player's controls.
//  The rules of the battle live in sim.js and never look in here. This file watches the battle (units, projs,
//  POINTS ...) and draws it, hears what happens through Out, and passes the player's controls in through me.ctl.
// ====================================================================
let scene, camera, renderer;
const fxPool = [], wrecks = [], wreckById = new Map(), views = new Map(), projViews = new Map();
let me = null, state = 'menu';
let camYaw = Math.PI / 2, camPitch = -0.12, fov = 60, zoomTarget = null, deadT = 0, hudT = 0;
let focus = null, focusDef = DEFS.spitfire;       // what the camera follows: your vehicle (or the wreck of it)
const aimDir = new THREE.Vector3(0, 0, 1), aimPoint = new THREE.Vector3();
const input = { keys: {}, fire: false, zoom: false };
let lastBought = 'spitfire', nukeFlash = 0, hurtFlash = 0, touchMode = false;
let selCol = 0, frontMesh = null, frontSeen = -1, menuTab = 'Deploy';
const $ = id => document.getElementById(id);

// -------------------------------------------------------------- audio
let actx = null, noiseBuf = null;
function playSfx(type, pos) {
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
function fxSpawn(pos, color, s0, s1, life, rise, op) {
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
// purely visual explosions and splashes (falling wrecks hitting the ground), drawn here without the rules
function boomFx(pos, size) {
  fxSpawn(pos, 0xffd060, size * 0.3, size, 0.35); fxSpawn(pos, 0xff6a10, size * 0.2, size * 0.75, 0.55);
  fxSpawn(pos, 0x2e2e2e, size * 0.4, size * 1.5, 1.8, 7, 0.6);
  playSfx(size > 12 ? 'boom' : 'shell', pos);
}
function splashLocal(pos, size) { TC.set(pos.x, World.water, pos.z); fxSpawn(TC, 0xffffff, size * 0.25, size, 0.7, 9, 0.75); playSfx('splash', pos); }
function smokeFx(pos, size, col) { fxSpawn(pos, col || 0x222222, size * 0.5, size * 2.2, 2.6, 7, 0.5); }

// -------------------------------------------------------------- messages
function showMsg(text, cls) {
  const el = document.createElement('div'); el.textContent = text; if (cls) el.className = cls;
  const f = $('feed'); f.prepend(el);
  while (f.children.length > 7) f.lastChild.remove();
  setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 700); }, 7000);
}
function showBanner(title, sub) {
  const b = $('banner'); b.innerHTML = ''; b.append(title);
  const s = document.createElement('small'); s.textContent = sub || ''; b.append(s);
  b.style.opacity = 1; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => b.style.opacity = 0, 4500);
}

// -------------------------------------------------------------- what the battle tells this screen
function wireOut() {
  Out.fx = fxSpawn; Out.sfx = playSfx;
  Out.nuke = () => { nukeFlash = 1.8; };
  Out.msg = (team, text, cls) => { if (team < 0 || team === me.team) showMsg(text, cls); };
  Out.tell = (pl, text, cls) => { if (pl === me) showMsg(text, cls); };
  Out.banner = (team, title, sub) => { if (team < 0 || team === me.team) showBanner(title, sub); };
  Out.killed = wreckUnit;
  Out.died = (pl, u) => { if (pl === me) playerDied(u); };
  Out.clearWreck = clearWreck;
  Out.hurt = pl => { if (pl === me) hurtFlash = 0.25; };
  Out.control = (pl, u) => { if (pl === me) onControl(u); };
  Out.over = showOver;
  Out.season = s => { showBanner(s.name, s.desc); showMsg(`Season change: ${s.name}. ${s.desc}.`); };
}

// -------------------------------------------------------------- the units on screen
// Every unit in the battle gets a model here (keyed by its id), kept in step with it each frame. When the battle
// drops a unit the model goes too; when one is destroyed its model turns into a wreck.
function makeView(u) {
  // painted as its own side's vehicle (buildings: as its army's), banded in the colour of the army fielding it
  const d = u.def, k = d.team !== undefined ? d.team : KIT[u.team], v = { mesh: buildModel(d, k), team: k, people: [], chute: null, fxT: rnd(0, 1), seen: 0 };
  scene.add(v.mesh); views.set(u.id, v);
  if (d.domain === 'bld' && d.model !== 'dock') addPeople(u, v);
  return v;
}
function addPeople(u, v) {
  const d = u.def, n = Math.min(d.people, 6);
  const cols = d.job === 'workers' ? [0x3b5b8a, 0x2f4a70] : d.job === 'gunners' ? [KIT[u.team] === ALLY ? 0x5a6a3c : 0x6a6d60] : [0xb04a3a, 0x3a7a5a, 0xc9a23a, 0x6a4a8a, 0xdedede];
  for (let i = 0; i < n; i++) {
    const m = figure(cols[i % cols.length]); m.visible = false; scene.add(m);
    v.people.push({ mesh: m, a: rnd(0, 6.28), r: d.model === 'aagun' ? rnd(2, 3.2) : d.radius + rnd(1.5, 7), sp: (d.model === 'aagun' ? 0.15 : rnd(0.12, 0.3)) * (Math.random() < 0.5 ? -1 : 1) });
  }
}
const CHUTE_GEO = new THREE.SphereGeometry(7, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
const CHUTE_MAT = new THREE.MeshLambertMaterial({ color: 0xf2efe2, side: THREE.DoubleSide });
function syncUnit(u, v, dt) {
  const m = v.mesh, d = u.def; m.position.copy(u.pos);
  if (v.team !== u.team) { v.team = u.team; if (m.userData.teamMat) m.userData.teamMat.color.setHex(TEAM_COL[u.team]); }   // defected
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
  if (u.chute > 0 && !v.chute) { v.chute = new THREE.Mesh(CHUTE_GEO, CHUTE_MAT); v.chute.position.y = 9; v.chute.userData.chute = true; m.add(v.chute); }
  else if (u.chute <= 0 && v.chute) { m.remove(v.chute); v.chute = null; }
  if (d.domain === 'bld' && u.built >= 1) {     // people going about their work, factory chimneys smoking
    const near = u.pos.distanceToSquared(camera.position) < 700 * 700;
    for (const p of v.people) {
      p.mesh.visible = near; if (!near) continue;
      p.a += p.sp * dt; const x = u.pos.x + Math.sin(p.a) * p.r, z = u.pos.z + Math.cos(p.a) * p.r;
      p.mesh.position.set(x, terrainH(x, z) + 0.75 + Math.abs(Math.sin(time * 7 + p.a * 9)) * 0.12, z); p.mesh.rotation.y = p.a + (p.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    if (d.model === 'factory' && near && dt > 0) { v.fxT -= dt; if (v.fxT <= 0) { v.fxT = 0.5; TC.copy(m.userData.stack).add(u.pos); fxSpawn(TC, 0x777777, 1.2, 5, 3, 5, 0.4); } }
  }
  if (dt > 0 && (u.hp < u.maxHp * 0.5 && d.domain !== 'bld' || u.hp < u.maxHp * 0.35)) {     // damaged: trailing smoke
    v.fxT -= dt; if (v.fxT <= 0) { v.fxT = 0.3; centerOf(u, TC); TC.y += 1.5; smokeFx(TC, d.len ? 3.5 : 1.6, u.hp < u.maxHp * 0.25 ? 0x151515 : 0x555555); }
  }
}
function dropView(id, v) { scene.remove(v.mesh); for (const p of v.people) scene.remove(p.mesh); views.delete(id); }
let viewFrame = 0;
function syncView(dt) {
  viewFrame++;
  for (const u of units) { const v = views.get(u.id) || makeView(u); v.seen = viewFrame; syncUnit(u, v, dt); }
  for (const [id, v] of views) if (v.seen !== viewFrame) dropView(id, v);
  syncProjs(dt); syncPoints();
  if (frontVer !== frontSeen) { frontSeen = frontVer; refreshFront(); }
}
// ---- wrecks: what is left of a destroyed unit falls, sinks or burns where it is
const WRECK_MAT = [0x1d1b19, 0x2e2a26, 0x3a2a20].map(c => new THREE.MeshLambertMaterial({ color: c }));
function wreckUnit(u) {
  const v = views.get(u.id) || makeView(u); syncUnit(u, v, 0);
  for (const p of v.people) scene.remove(p.mesh); views.delete(u.id);
  const m = v.mesh, d = u.def; let i = 0;
  m.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.person || o.userData.chute || o.userData.decal || o.material === PROP) { o.visible = false; return; }
    o.material = WRECK_MAT[(i++) % 3];
  });
  const w = { id: u.id, mesh: m, def: d, t: 0, k: 0, smokeFor: rnd(25, 45), smokeT: 0, vel: u.vel.clone(), state: 'burn', spin: rnd(-2.5, 2.5), yaw: u.yaw, pitch: u.pitch, roll: u.roll, tRoll: rnd(0.25, 0.6) * (Math.random() < 0.5 ? -1 : 1), baseY: u.pos.y };
  if (d.domain === 'air') w.state = 'fall';
  else if (d.domain === 'sea') w.state = 'sink';
  else if (d.domain === 'bld') { m.scale.y = 0.28; m.rotation.z = rnd(-0.06, 0.06); }
  else if (m.userData.soldiers) for (const s of m.userData.soldiers) { s.visible = true; s.rotation.x = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); s.rotation.y = rnd(0, 6); s.position.y = 0.3; }
  else { m.rotation.z = rnd(-0.18, 0.18); if (m.userData.turrets) m.userData.turrets[0].rotation.set(rnd(-0.15, 0.1), rnd(0, 6), rnd(-0.2, 0.2)); }
  if (u.chute > 0) w.state = 'fall';
  wrecks.push(w); wreckById.set(u.id, w);
  if (wrecks.length > 240) { const o = wrecks.shift(); scene.remove(o.mesh); wreckById.delete(o.id); }
}
// rubble cleared to make room for a new building or command post
function clearWreck(id) {
  const w = wreckById.get(id); if (!w) return;
  scene.remove(w.mesh); wreckById.delete(id); const i = wrecks.indexOf(w); if (i >= 0) wrecks.splice(i, 1);
}
function updateWrecks(dt) {
  for (const w of wrecks) {
    w.t += dt; const m = w.mesh;
    if (w.state === 'fall') {
      w.vel.y -= 32 * dt; w.vel.x *= 1 - 0.25 * dt; w.vel.z *= 1 - 0.25 * dt;
      m.position.addScaledVector(w.vel, dt); w.roll += w.spin * dt; w.pitch = Math.max(-1.1, w.pitch - 0.5 * dt);
      m.rotation.set(-w.pitch, w.yaw, w.roll, 'YXZ');
      w.smokeT -= dt; if (w.smokeT <= 0) { w.smokeT = 0.06; fxSpawn(m.position, 0x1c1c1c, 1.5, 5, 1.6, 2, 0.6); if (Math.random() < 0.4) fxSpawn(m.position, 0xff7a20, 1, 2.5, 0.3); }
      const th = terrainH(m.position.x, m.position.z);
      if (m.position.y <= Math.max(th, World.water) + 1) {
        boomFx(m.position, w.def.radius * 2.5);
        if (th >= World.water) { m.position.y = th + 0.7; m.rotation.set(rnd(-0.25, 0.1), w.yaw, rnd(-0.5, 0.5), 'YXZ'); w.state = 'burn'; }
        else { splashLocal(m.position, w.def.radius * 2); m.position.y = World.water; w.baseY = World.water; w.state = 'sink'; w.t = 0; }
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
        if (m.position.distanceToSquared(camera.position) < 1400 * 1400) { TC.copy(m.position); TC.y += (w.def.centerY || 1) + 2; smokeFx(TC, w.def.len ? 5 : 2.5); }
      }
    }
  }
}
// ---- shells, bullets, bombs, torpedoes and missiles in flight, with their trails
const PGEO = {
  bullet: new THREE.BoxGeometry(0.18, 0.18, 3.2), shell: new THREE.SphereGeometry(0.6, 6, 5),
  bomb: new THREE.CylinderGeometry(0.45, 0.3, 2.2, 6).rotateX(Math.PI / 2), nuke: new THREE.CylinderGeometry(1.5, 0.9, 6, 8).rotateX(Math.PI / 2), torpedo: new THREE.CylinderGeometry(0.45, 0.45, 5, 6).rotateX(Math.PI / 2),
  aam: new THREE.CylinderGeometry(0.24, 0.24, 3.6, 6).rotateX(Math.PI / 2)
};
const PMAT = {
  bullet: new THREE.MeshBasicMaterial({ color: 0xffe27a }), shell: new THREE.MeshBasicMaterial({ color: 0xff9a3a }),
  bomb: new THREE.MeshLambertMaterial({ color: 0x2a2d28 }), nuke: new THREE.MeshLambertMaterial({ color: 0xd8c23a }), torpedo: new THREE.MeshLambertMaterial({ color: 0x30343a }),
  aam: new THREE.MeshBasicMaterial({ color: 0xf4f4ee })
};
function syncProjs(dt) {
  for (const p of projs) {
    let v = projViews.get(p.id);
    if (!v) { v = { mesh: new THREE.Mesh(PGEO[p.kind], PMAT[p.kind]), wake: 0, seen: 0 }; scene.add(v.mesh); projViews.set(p.id, v); }
    v.seen = viewFrame; v.mesh.position.copy(p.pos); T3.copy(p.pos).add(p.vel); v.mesh.lookAt(T3);
    if (dt > 0 && (p.kind === 'aam' || (p.kind === 'torpedo' && p.swim))) {
      v.wake -= dt;
      if (v.wake <= 0 && p.kind === 'aam') { v.wake = 0.05; fxSpawn(p.pos, 0xe6e6e0, 0.7, 3.2, 0.8, 1, 0.5); }
      else if (v.wake <= 0) { v.wake = 0.12; TC.copy(p.pos).setY(World.water + 0.1); fxSpawn(TC, 0xffffff, 0.8, 2.4, 1.6, 0, 0.5); }
    }
  }
  for (const [id, v] of projViews) if (v.seen !== viewFrame) { scene.remove(v.mesh); projViews.delete(id); }
}
// ---- capture point beacons and the front line curtain
const BEAM_GEO = new THREE.CylinderGeometry(5, 5, 320, 8, 1, true);
const beams = [];
function ownerHex(o) { return o < 0 ? 0xf2f0e0 : TEAM_COL[o]; }
function ownerCss(o) { return o < 0 ? '#f2f0e0' : TEAM_CSS[o]; }
// a lighter shade of a side's colour, for small dots and text on dark maps
function lightCss(t) { const c = TEAM_COL[t]; return `rgb(${(c >> 16) + 255 >> 1},${(c >> 8 & 255) + 255 >> 1},${(c & 255) + 255 >> 1})`; }
// which way a capture point's progress bar is heading, and in whose colour
function progCss(p, light) { const t = WAR ? p.by : p.prog > 0 ? ALLY : AXIS; return t < 0 ? '#ccc' : light ? lightCss(t) : TEAM_CSS[t]; }
// Warlords: what an army is called on screen (its player's name, or its colour)
function lordName(t) { const r = (Online.roster || []).find(q => q[2] === t); return r ? r[1] : t === me.team ? 'You' : TEAM_NAME[t] + ' warlord'; }
function lordLabel(t) { const n = lordName(t); return n.endsWith(' warlord') ? n : `${n} (${TEAM_NAME[t]})`; }
function initPoints() {
  for (const p of POINTS) {
    const b = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color: ownerHex(p.owner), transparent: true, opacity: 0.17, depthWrite: false, side: THREE.DoubleSide }));
    b.position.set(p.x, p.y + 175, p.z); b.userData.owner = p.owner; scene.add(b); beams.push(b);
  }
}
function syncPoints() {
  POINTS.forEach((p, i) => { const b = beams[i]; if (b && b.userData.owner !== p.owner) { b.userData.owner = p.owner; b.material.color.setHex(ownerHex(p.owner)); } });
}
// the front line, drawn in the world as a faint curtain following the ground
const FRONT_MAT = new THREE.MeshBasicMaterial({ color: 0xffb030, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
function refreshFront() {
  if (WAR) return;                     // no front line: everyone for themselves
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

// -------------------------------------------------------------- the player
// the battle handed you a vehicle (deployed, or switched to another one)
function onControl(u) {
  focus = u.pos; focusDef = u.def; camYaw = u.yaw; camPitch = u.def.domain === 'air' && !u.def.heli ? 0 : -0.12;
  $('vname').textContent = u.def.name;
  $('vdomain').textContent = (u.def.heli ? 'Helicopter' : u.def.sub ? 'Submarine' : { air: 'Aircraft', land: 'Ground forces', sea: 'Warship' }[u.def.domain]) + ' · crew ' + u.def.crew;
  $('w2row').style.display = u.def.alt ? 'flex' : 'none'; if (u.def.alt) $('w2n').textContent = u.def.alt.label;
  $('w1n').textContent = u.def.gun ? u.def.gunLabel || (u.def.gun.kind === 'shell' ? 'Main guns' : 'Machine guns') : 'Unarmed';
  const tc = $('touch'); tc.classList.toggle('heli', !!u.def.heli); tc.classList.toggle('sub', !!u.def.sub); tc.classList.toggle('noalt', !u.def.alt);
  if (u.def.alt) $('tAlt').textContent = u.def.alt.label.split(' ')[0];
  $('tDive').textContent = u.diveT > 0.5 ? 'Rise' : 'Dive';
  if (pendingDeploy) { const p = pendingDeploy; pendingDeploy = null; enterBattle(p.id, p.col, p.first, u); }
}
function diveKey() {
  if (state !== 'playing' || !me.unit || !me.unit.def.sub) return;
  if (Online.on) { Online.send({ t: 'dive' }); return; }        // the button label follows the next snapshot
  toggleDive(me); $('tDive').textContent = me.unit.diveT ? 'Rise' : 'Dive';
}
// your vehicle is gone: the camera stays on the wreck until you pick another
function playerDied(u) {
  const w = wreckById.get(u.id); focus = w ? w.mesh.position : null;
  state = 'dead'; deadT = 2.6; input.fire = false; input.zoom = false;
}
function switchVehicle() { if (state !== 'playing') return; if (Online.on) Online.send({ t: 'switch' }); else switchUnit(me); }
function computeAim() {
  fwd(camYaw, camPitch, aimDir); const o = camera.position; let best = 1500;
  for (const u of units) {
    if (u === me.unit) continue;
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
    if (u.team === me.team) continue;
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
// the enemy aircraft in your missile seeker: the one you are zoomed on, or the nearest to the reticle
function playerLock() {
  const a = me.unit && me.unit.def.alt; if (!a || a.kind !== 'aam') return null;
  if (zoomTarget && zoomTarget.def.domain === 'air' && !zoomTarget.dead) return zoomTarget;
  return airLock(me.team, camera.position, aimDir, 0.3, a.range);
}
// what you are doing with the controls this frame, handed to the battle
function fillControls() {
  const c = me.ctl, k = input.keys, on = state === 'playing' && !!me.unit;
  if (on) computeAim();
  c.w = on && !!k.KeyW; c.s = on && !!k.KeyS; c.a = on && !!k.KeyA; c.d = on && !!k.KeyD; c.e = on && !!k.KeyE; c.q = on && !!k.KeyQ;
  c.fire = on && input.fire; c.alt = on && !!k.Space;
  c.yaw = camYaw; c.aimDir.copy(aimDir); c.aimPoint.copy(aimPoint); c.lock = on ? playerLock() : null;
}
function updateCamera(dt) {
  if (state === 'menu') {
    const a = performance.now() * 0.00006, B = BASE[me.team];
    const q = WAR ? (selCol < 0 ? { x: B.x, y: terrainH(B.x, B.z), z: B.z } : POINTS[selCol]) : selCol < 0 ? ENG[1] : PT(selCol, 1); camera.position.set(q.x + Math.sin(a) * 380, q.y + 150, q.z + Math.cos(a) * 380);
    camera.lookAt(q.x, q.y + 10, q.z); return;
  }
  if (!focus) return;
  const d = focusDef; fov += ((input.zoom ? 17 : 60) - fov) * Math.min(1, dt * 10);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const lim = d.domain === 'air' && !d.heli ? 1.3 : 1.0; camPitch = clamp(camPitch, -lim, lim);
  fwd(camYaw, camPitch, aimDir);
  const p = focus; camera.position.set(p.x, p.y + d.camH, p.z).addScaledVector(aimDir, -d.camDist);
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
  $('shopMoney').textContent = '$' + Math.floor(me.money).toLocaleString();
  const tabs = $('tabs'); tabs.innerHTML = '';
  for (const t of Object.keys(SHOP)) {
    const b = document.createElement('button'); b.className = 'tab' + (t === shopTab ? ' on' : ''); b.textContent = t;
    b.onclick = () => { shopTab = t; renderShop(); }; tabs.append(b);
  }
  const box = $('shopCards'); box.innerHTML = '';
  const mobile = units.filter(u => u.team === me.team && u.def.domain !== 'bld').length;
  for (const id of SHOP[shopTab].map(i => sideId(i, me.team)).filter(Boolean)) {
    const d = DEFS[id], isB = d.domain === 'bld', nc = NONCOMBAT[d.role], own = isB || nc || Account.has(id);
    const full = isB ? !plots[me.team].some(p => !p.unit) : mobile >= UNIT_CAP + 8;
    const can = own && me.money >= d.cost && !full;
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
      mk(me.deployCd > 0 ? `Deploy in ${Math.ceil(me.deployCd)}s` : 'Deploy · free', false, () => buy(id, true), me.deployCd <= 0);
      mk('Escort $' + d.cost.toLocaleString(), true, () => buy(id, false), can);
    }
    box.append(c);
  }
}
// Every vehicle in a tier you have unlocked is free to deploy in (and respawn in). Extra computer-flown escorts,
// supply vehicles and buildings are paid for from this battle's war chest (buyFor in sim.js).
function buy(id, command) {
  const d = DEFS[id];
  if (command && d.domain !== 'bld' && !NONCOMBAT[d.role]) { deploy(id); return; }
  if (Online.on) { if (me.money >= d.cost) Online.send({ t: 'buy', id, col: selCol }); return; }   // the shop redraws with the next snapshot
  if (buyFor(me, id, selCol)) renderShop();
}
function toggleShop(on) {
  if (on && state === 'playing') {
    state = 'shop'; $('shop').classList.add('on'); if (document.exitPointerLock) document.exitPointerLock(); input.fire = false; input.zoom = false;
    $('shopSub').textContent = Online.on ? 'The battle carries on while you shop: your vehicle keeps going.' : 'The battle is paused.'; renderShop();
  }
  else if (!on && state === 'shop') { state = 'playing'; $('shop').classList.remove('on'); }
}
// ---- campaign map: shown before the battle, after losing a vehicle, and on M (paused)
// The Allies push east from sector 0 (and their homeland, -1); the Axis push west from the last sector.
function frontCol() {
  if (WAR) return -1;
  const t = me.team; let c = t === ALLY ? 0 : COLS - 1;
  for (const p of POINTS) if (!p.eng && p.owner === t) c = t === ALLY ? Math.max(c, p.col) : Math.min(c, p.col);
  return c;
}
function canDeployIn(c) {
  if (WAR) return c < 0 || (POINTS[c] && POINTS[c].owner === me.team);
  const t = me.team, home = t === ALLY ? c <= 0 : c === COLS - 1, next = frontCol() + (t === ALLY ? 1 : -1);
  return home || POINTS.some(p => secOf(p) === c && p.owner === t) || (TH.islands && c === next && c >= 0 && c < COLS);
}
// islands: picking a sector the Allies hold nothing in means an amphibious landing there
function isLanding(c) { return !WAR && TH.islands && c >= 0 && !POINTS.some(p => secOf(p) === c && p.owner === me.team); }
function secPoints(c) { return WAR ? (c < 0 ? [] : [POINTS[c]]) : POINTS.filter(p => secOf(p) === c); }
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
  $('menuTitle').textContent = mode === 'dead' ? 'Vehicle lost' : mode === 'map' ? (WAR ? 'Battle map' : 'Campaign map') : WAR ? 'Warlords' : (TH.game || 'Frontline 1944');
  const where = WAR ? 'your base or a point you hold' : 'a sector on the map';
  $('menuSub').textContent = mode === 'dead' ? `The wreck stays where it fell. Pick ${where} and a vehicle to rejoin the battle.`
    : mode === 'map' ? (Online.on ? 'The battle carries on. Redeploy to another sector or visit the Armory.' : 'The battle is paused. Redeploy to another sector, visit the Armory, or end the operation and bank your credits.')
      : Online.code ? (WAR ? `Warlords battle ${Online.code} on the game server: you lead the ${TEAM_NAME[me.team]} army. Most score when the clock runs out wins. Pick ${where} and a vehicle.`
        : `Battle ${Online.code} on the game server. Pick ${where} and a vehicle to join the fight.`) : TH.str.goal;
  const ft = $('frontTabs'); ft.innerHTML = '';
  for (const k of Object.keys(THEATRES)) {
    const T = THEATRES[k], b = document.createElement('button'); b.className = 'tab' + (k === TH.id ? ' on' : '');
    b.innerHTML = `${T.title}<small></small>`; b.querySelector('small').textContent = T.blurb;
    b.disabled = (mode !== 'menu' || Online.code) && k !== TH.id; if (b.disabled) b.title = Online.code ? 'Leave the online battle first' : 'End the operation first';
    b.onclick = () => { if (k !== TH.id && !b.disabled) switchTheatre(k); }; ft.append(b);
  }
  {                                                         // Warlords: everyone for themselves
    const b = document.createElement('button'); b.className = 'tab' + (WAR ? ' on' : '');
    b.innerHTML = 'Warlords<small>Everyone for themselves</small>';
    b.disabled = (mode !== 'menu' || Online.code) && !WAR; if (b.disabled) b.title = Online.code ? 'Leave the online battle first' : 'End the operation first';
    b.onclick = () => { if (!WAR && !b.disabled) switchTheatre('war4'); }; ft.append(b);
  }
  if (!Online.code && !WAR) for (const m of loadMaps()) {               // maps built in the map builder
    const k = 'map-' + m.id, b = document.createElement('button'); b.className = 'tab' + (k === TH.id ? ' on' : '');
    b.innerHTML = '<span></span><small></small>'; b.firstChild.textContent = m.name; b.querySelector('small').textContent = 'Custom · ' + THEATRES[m.base].title;
    b.disabled = mode !== 'menu' && k !== TH.id; if (b.disabled) b.title = 'End the operation first';
    b.onclick = () => { if (k !== TH.id && mode === 'menu') switchTheatre(k); }; ft.append(b);
  }
  if (mode === 'menu' && !Online.code && !WAR) {
    const b = document.createElement('button'); b.className = 'tab builder'; b.innerHTML = '✎ Map Builder<small>Make your own battlefield</small>';
    b.onclick = () => { location.href = 'editor.html' + (TH.custom ? '?map=' + TH.custom.id : ''); }; ft.append(b);
  }
  $('acct').innerHTML = `<b>${a.credits.toLocaleString()}</b> credits` + (mode !== 'menu' ? ` <i>+${me.stats.credits.toLocaleString()} this battle</i>` : '') + `<small>${a.battles} battles · ${a.wins} won · ${a.kills} kills · ${a.campaigns} campaigns won</small>`;
  const sec = secPoints(selCol), held = sec.filter(p => p.owner === me.team).length;
  if (WAR) {
    $('sectorInfo').innerHTML = (selCol < 0 ? 'Deploying at <b>your base</b> · runway and harbour' : `Deploying at <b>${POINTS[selCol].name}</b>`) +
      ' · click a point you hold on the map to deploy there';
    if (mode === 'menu' && !Online.code) {                  // single player: how many armies
      const row = document.createElement('div'); row.className = 'warN'; row.innerHTML = '<span>Armies</span>';
      for (let k = 2; k <= 8; k++) { const b = document.createElement('button'); b.className = 'tab' + (k === NTEAMS ? ' on' : ''); b.textContent = k; b.onclick = () => { if (k !== NTEAMS) switchTheatre('war' + k); }; row.append(b); }
      $('sectorInfo').append(row);
    }
  } else
  $('sectorInfo').innerHTML = isLanding(selCol) ? `Landing on <b>${SECTORS[selCol]}</b> · ground forces make an amphibious assault on its beach; ships and aircraft join the battle offshore`
    : (selCol < 0 ? `Deploying in <b>${HOME_NAME}</b>` : `Deploying in the <b>${SECTORS[selCol]}</b> sector`) + ` · ${held} of ${sec.length} points held` + (selCol === frontCol() ? ' · front line' : '') + (selCol < 0 ? ' · home runway and harbour' : '');
  const tabs = $('menuTabs'); tabs.innerHTML = '';
  for (const t of ['Deploy', 'Armory', 'Play together']) {
    const b = document.createElement('button'); b.className = 'tab' + (t === menuTab ? ' on' : ''); b.textContent = t;
    b.onclick = () => { menuTab = t; renderMenu(); }; tabs.append(b);
  }
  $('starters').style.display = menuTab === 'Deploy' ? '' : 'none'; $('armory').style.display = menuTab === 'Armory' ? '' : 'none'; $('online').style.display = menuTab === 'Play together' ? '' : 'none';
  if (menuTab === 'Deploy') renderStarters(); else if (menuTab === 'Armory') renderArmory(); else renderOnline();
  renderNameRow();
  const row = $('menuBtns'); row.innerHTML = '';
  const mk = (label, alt, fn) => { const b = document.createElement('button'); b.className = 'btn' + (alt ? ' alt' : ''); b.textContent = label; b.onclick = fn; row.append(b); };
  if (mode === 'map') mk('Back to battle', false, () => toggleMap(false));
  if (WAR && !Online.code && mode === 'menu') mk('Back to the campaign', true, () => switchTheatre('eu'));
  if (Online.code) {
    if (Online.on && Online.host && mode !== 'menu') mk('End the battle for everyone and bank credits', true, () => Online.send({ t: 'end' }));
    else if (Online.on && mode !== 'menu') mk('Leave the battle and bank credits', true, () => { Online.ws.close(); Online.on = false; showOver(); });
    else mk('Back to single player', true, () => Online.leave());
  } else if (mode !== 'menu') mk(WAR ? 'End the match and bank credits' : 'End operation and bank credits', true, () => endBattle());
}
// ---- playing together on the game server: host a battle and read out its code, or join one with a code
function renderOnline() {
  const box = $('online'); box.innerHTML = '';
  const field = (label, id, value, ph) => {
    const l = document.createElement('label'); l.innerHTML = '<span></span><input>'; l.firstChild.textContent = label;
    const i = l.lastChild; i.id = id; i.value = value; i.placeholder = ph || ''; i.spellcheck = false; i.autocomplete = 'off'; box.append(l); return i;
  };
  const head = text => { const h = document.createElement('div'); h.className = 'nethead'; h.textContent = text; box.append(h); };
  const btn = (label, alt, fn, row) => { const b = document.createElement('button'); b.className = 'btn' + (alt ? ' alt' : ''); b.textContent = label; b.onclick = fn; row.append(b); return b; };
  const codeBox = (ph) => {
    const i = document.createElement('input'); i.className = 'netcodein'; i.placeholder = ph; i.maxLength = 8; i.autocomplete = 'off'; i.spellcheck = false;
    i.oninput = () => { i.value = i.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }; return i;
  };
  if (Online.code) {                        // in a battle: its code, who is playing, and (versus) which side you are on
    const s = document.createElement('div'); s.className = 'netcode'; s.innerHTML = '<small>Battle code</small><b></b><span></span>';
    s.querySelector('b').textContent = Online.code; s.querySelector('span').textContent = Online.status; box.append(s);
    if (Online.roster.length) {
      head('Players');
      const list = document.createElement('div'); list.className = 'netlist';
      for (const r of Online.roster) {
        const d = document.createElement('div'); d.className = WAR ? '' : r[2] === ALLY ? 'ally' : 'axis'; if (WAR) d.style.borderLeftColor = TEAM_CSS[r[2]];
        const unit = r[3] && units.find(u => u.id === r[3]);
        d.innerHTML = '<b></b><span></span>'; d.firstChild.textContent = r[1] + (r[0] === me.id ? ' (you)' : '');
        d.lastChild.textContent = (WAR ? TEAM_NAME[r[2]] + ' army · ' + (KIT[r[2]] === ALLY ? 'Allied' : 'Axis') + ' vehicles · score ' + Math.round(Score[r[2]]) : SIDE_PL[r[2]]) + ' · ' + (unit ? unit.def.name : 'choosing a vehicle'); list.append(d);
      }
      box.append(list);
    }
    if (Online.on && WAR) {
      head('Your vehicles');
      const row = document.createElement('div'); row.className = 'netrow';
      for (const k of [ALLY, AXIS]) { const b = btn(`Fly the ${k === ALLY ? 'Allied' : 'Axis'} flag`, k !== KIT[me.team], () => Online.send({ t: 'kit', kit: k }), row); b.disabled = k === KIT[me.team] || !!me.unit; }
      box.append(row);
      const n = document.createElement('div'); n.className = 'note'; n.textContent = 'Your army fights in your colour either way; this picks which vehicles you and your computer forces field.' + (me.unit ? ' You can change it when you are not in a vehicle.' : ''); box.append(n);
    }
    if (Online.on && Online.mode === 'pvp') {
      head('Your side');
      const row = document.createElement('div'); row.className = 'netrow';
      for (const t of [ALLY, AXIS]) { const b = btn(`Fight for the ${SIDE_PL[t]}`, t !== me.team, () => Online.side(t), row); b.disabled = t === me.team || !!me.unit; }
      box.append(row);
      if (me.unit) { const n = document.createElement('div'); n.className = 'note'; n.textContent = 'You can change sides when you are not in a vehicle.'; box.append(n); }
    }
    return;
  }
  const addr = field('Game server', 'netAddr', Online.url(), 'e.g. frontline.goonlab.opik.net');
  const name = field('Your name', 'netName', localStorage.getItem(NAME_KEY) || '', 'Shown above your vehicle to the other players');
  const save = () => { if (addr.value.trim()) localStorage.setItem(SERVER_KEY, addr.value.trim()); if (name.value.trim()) localStorage.setItem(NAME_KEY, name.value.trim().slice(0, 16)); };
  for (const i of [addr, name]) i.onkeydown = e => e.stopPropagation();
  head(`Host a battle on the ${TH.title}`);
  const hrow = document.createElement('div'); hrow.className = 'netrow';
  const own = codeBox('Code (optional)'); own.title = 'Pick your own code, 3 to 8 letters or numbers. Leave it empty for a random one.';
  hrow.append(own);
  btn('Co-op: all of us vs the computer', false, () => { save(); Online.hostGame(addr.value, 'coop', own.value); }, hrow);
  btn('Versus: Allies vs Axis', false, () => { save(); Online.hostGame(addr.value, 'pvp', own.value); }, hrow);
  own.onkeydown = e => e.stopPropagation();
  box.append(hrow);
  // Warlords: everyone for themselves, on a map made for the number of armies, for a set time
  const wrow = document.createElement('div'); wrow.className = 'netrow';
  const pick = (label, opts, val) => {
    const l = document.createElement('label'); l.className = 'netpick'; l.innerHTML = '<span></span><select></select>'; l.firstChild.textContent = label;
    for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === val) o.selected = true; l.lastChild.append(o); }
    wrow.append(l); return l.lastChild;
  };
  const armies = pick('Armies', [2, 3, 4, 5, 6, 7, 8].map(k => [k, k + (k === 2 ? ' armies' : '')]), WAR ? NTEAMS : 4);
  const len = pick('Match', [5, 10, 15, 20, 30].map(k => [k, k + ' min']), 10);
  btn('Warlords: everyone for themselves', false, () => { save(); Online.hostGame(addr.value, 'ffa', own.value, { armies: +armies.value, len: +len.value }); }, wrow);
  box.append(wrow);
  head('Join a battle');
  const jrow = document.createElement('div'); jrow.className = 'netrow';
  const code = codeBox('CODE'); jrow.append(code);
  const join = btn('Join with code', true, () => { save(); Online.joinGame(code.value); }, jrow);
  code.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') join.onclick(); };
  box.append(jrow);
  const note = document.createElement('div'); note.className = 'note';
  note.textContent = Online.status || 'Co-op: everyone fights for the Allies against the computer, and the host\'s unlocks set how strong the enemy is. Versus: players split between the Allies and the Axis, with the computer filling both armies. Warlords: every player leads an army of their own colour (the computer leads the rest) and the best score when the clock runs out wins. Everyone keeps the credits they earn.';
  box.append(note);
}
// online: the name others see above your vehicle, changeable from the menu (and the respawn screen)
function renderNameRow() {
  const row = $('nameRow'); row.style.display = Online.code ? '' : 'none';
  if (!Online.code || row.firstChild) return;
  row.innerHTML = '<span>Playing as</span><input id="nameIn" maxlength="16" autocomplete="off" spellcheck="false"><small>Others see this above your vehicle</small>';
  const i = $('nameIn'); i.value = Online.name();
  const save = () => { if (i.value.trim() && i.value.trim() !== Online.name()) { Online.setName(i.value); showMsg(`You are now ${Online.name()}`, 'good'); } };
  i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); };
  i.onchange = save; i.onblur = save;
}
function renderStarters() {
  const box = $('starters'); box.innerHTML = '';
  const ids = SHOP.Air.concat(SHOP.Land, SHOP.Sea).map(i => sideId(i, me.team)).filter(id => id && !NONCOMBAT[DEFS[id].role] && Account.has(id));
  if (!ids.includes(lastBought)) lastBought = ids[0];
  const wait = state === 'map' && me.deployCd > 0;
  for (const id of ids) {
    const d = DEFS[id], c = document.createElement('button'); c.className = 'card' + (id === lastBought ? ' def' : '') + (wait ? ' no' : '');
    c.innerHTML = `<div class="k">${BRANCH[d.domain]} · tier ${d.tier}${id === lastBought && state === 'dead' ? ' · press Enter' : ''}</div><div class="t"></div><div class="d"></div><div class="s"></div>`;
    c.querySelector('.t').textContent = d.name; c.querySelector('.d').textContent = wait ? `Redeploy available in ${Math.ceil(me.deployCd)}s.` : d.desc; c.querySelector('.s').textContent = statLine(d);
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
  note.textContent = `Unlocks are permanent. Credits are paid out when a battle ends. The ${SIDE_PL[AXIS]} field the same tiers you have unlocked, so the war escalates with you.`;
  box.append(note);
}
// take command of a vehicle in the selected sector: free in any unlocked tier
// Online, the server hands the vehicle over a moment later (onControl), and the menu stays up until it does.
let pendingDeploy = null;
function deploy(id) {
  if (!Account.has(id) || !sideOk(id, me.team) || NONCOMBAT[DEFS[id].role] || state === 'over') return;
  const first = state === 'menu', redeploy = state === 'map' || state === 'shop';
  if (redeploy && me.deployCd > 0) return;
  initAudio();
  if (Online.code) {
    if (!Online.on || pendingDeploy) return;
    const p = pendingDeploy = { id, col: selCol, first };
    Online.send({ t: 'deploy', id, col: selCol }); lockPointer();
    setTimeout(() => { if (pendingDeploy === p) { pendingDeploy = null; if (document.exitPointerLock) document.exitPointerLock(); showMsg('The server could not deploy that vehicle. Try again.', 'bad'); } }, 4000);
    return;
  }
  const u = deployPlayer(me, id, selCol); if (!u) return;     // your previous personal vehicle is withdrawn
  enterBattle(id, selCol, first, u);
}
function enterBattle(id, col, first, u) {
  lastBought = id;
  state = 'playing'; $('menu').classList.remove('on'); $('shop').classList.remove('on'); $('hud').style.display = 'block';
  if (first) { const s = World.info; showBanner(WAR ? (col < 0 ? 'Warlords' : secName(col)) : secName(col) + (col < 0 ? '' : ' sector'), WAR ? `You are the ${TEAM_NAME[me.team]} army. ${s.name}: ${s.desc}.` : `${s.name}. ${s.desc}`); } else showMsg(`Deployed in ${DEFS[id].name}, ${secName(col)}`, 'good');
  if (u && u.landedAt) showMsg(`Amphibious landing! You are ashore below ${u.landedAt.name || 'the enemy capital'}.`, 'gold');
  if (!Online.code) lockPointer();
}
function lockPointer() { const cv = renderer.domElement; if (!touchMode && cv.requestPointerLock) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } } }
const startAs = deploy;
function showRespawn() { openMenu(); }
// The battle is over (sim.js endBattle): winner is the side whose enemy headquarters fell, undefined when the clock
// ran out or the operation was called off. Credits are banked here; the state of the front is saved so the next
// battle carries on from it.
function showOver(winner) {
  if (WAR) return showWarOver(winner);
  const result = winner === undefined ? null : winner === me.team ? 'won' : 'lost', st = me.stats;
  state = 'over';
  $('menu').classList.remove('on'); $('shop').classList.remove('on'); if (document.exitPointerLock) document.exitPointerLock();
  const gain = ownedBy(me.team) - startOwned[me.team], win = result === 'won' || (!result && gain > 0);
  const rows = [[`Enemies destroyed (${st.kills})`, st.killCr], [`Points captured in person (${st.capCr / 250})`, st.capCr], ['Battle pay', 300]];
  if (gain > 0) rows.push([`Front line advanced (${gain} point${gain > 1 ? 's' : ''})`, gain * 150]);
  if (result === 'won') rows.push(['Campaign victory', 3000]);
  const total = rows.reduce((t, r) => t + r[1], 0);
  // the host's campaign carries on from this battle; someone who joined keeps their own campaign map as it was
  const keep = Online.code && (!Online.host || Online.mode === 'pvp');
  Account.reward({ credits: total, kills: st.kills, win, campaignWon: result === 'won' && !keep, owners: keep ? Account.data.camps[TH.id] : result ? null : POINTS.map(p => p.owner) });
  const vs = Online.mode === 'pvp';
  $('overTitle').textContent = result === 'won' ? (vs ? 'Victory' : 'Campaign won') : result === 'lost' ? (vs ? 'Defeat' : 'Campaign lost') : gain > 0 ? 'Ground gained' : gain < 0 ? 'Ground lost' : 'Stalemate';
  $('overSub').textContent = result === 'won' ? `The ${TEAM_NAME[1 - me.team]} headquarters is rubble. A new campaign begins, and you keep everything you have unlocked.`
    : result === 'lost' ? `The ${TEAM_NAME[me.team]} headquarters has fallen. The campaign starts over, but your unlocks and credits are safe.`
      : `The operation is over. The ${SIDE_PL[me.team]} hold ${ownedBy(me.team)} of ${POINTS.length} points; the front stays where you left it for the next battle.`;
  const box = $('overRows'); box.innerHTML = '';
  for (const r of rows.concat([['Credits earned', total], ['Credits in the bank', Account.data.credits]])) {
    const a = document.createElement('span'), b = document.createElement('b'); a.textContent = r[0]; b.textContent = (r[0] === 'Credits in the bank' ? '' : '+') + r[1].toLocaleString(); box.append(a, b);
  }
  setTimeout(() => $('over').classList.add('on'), result ? 2500 : 500);
}
// Warlords is a match of its own: it pays credits like a battle (more for a better place) and keeps no campaign map
function showWarOver() {
  const st = me.stats, order = TEAMS.slice().sort((a, b) => Score[b] - Score[a]), place = order.indexOf(me.team) + 1;
  state = 'over';
  $('menu').classList.remove('on'); $('shop').classList.remove('on'); if (document.exitPointerLock) document.exitPointerLock();
  const rows = [[`Enemies destroyed (${st.kills})`, st.killCr], [`Points captured in person (${st.capCr / 250})`, st.capCr], ['Battle pay', 300]];
  const placing = Math.round(800 * (NTEAMS - place) / (NTEAMS - 1) / 50) * 50; if (placing > 0) rows.push([`Finished ${ordinal(place)} of ${NTEAMS}`, placing]);
  const total = rows.reduce((t, r) => t + r[1], 0);
  Account.reward({ credits: total, kills: st.kills, win: place === 1, campaignWon: false, owners: null });
  $('overTitle').textContent = place === 1 ? 'Victory' : ordinal(place) + ' place';
  $('overSub').textContent = order.map((t, i) => `${i + 1}. ${lordLabel(t)} ${Math.round(Score[t])}`).join(' · ');
  const box = $('overRows'); box.innerHTML = '';
  for (const r of rows.concat([['Credits earned', total], ['Credits in the bank', Account.data.credits]])) {
    const a = document.createElement('span'), b = document.createElement('b'); a.textContent = r[0]; b.textContent = (r[0] === 'Credits in the bank' ? '' : '+') + r[1].toLocaleString(); box.append(a, b);
  }
  setTimeout(() => $('over').classList.add('on'), 1200);
}
function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }
// -------------------------------------------------------------- HUD
let ovCtx, miniCtx, miniBg;
function drawOverlay() {
  const cv = $('ov'), w = cv.width, h = cv.height, c = ovCtx; c.clearRect(0, 0, w, h);
  if (state !== 'playing' && state !== 'dead') { zoomTarget = null; return; }
  zoomTarget = null;
  if (input.zoom && me.unit) zoomTarget = nearestToReticle(0.1);
  for (const u of units) {
    if (u === me.unit) continue;
    const pilot = Online.pilots.get(u.id), dist = u.pos.distanceTo(camera.position);
    // friends' vehicles are marked wherever they are; other markers only show nearby
    const maxD = pilot && pilot.team === me.team ? 9000 : (u.def.domain === 'bld' ? 1100 : 2000) * World.vis * (pilot ? 1.5 : 1);
    if (dist > maxD) continue;
    if (u.team !== me.team && u.def.sub && u.dive > 0.5 && dist > 450) continue;
    T1.copy(u.pos); T1.y += (u.def.centerY || 0) + (u.def.len ? u.def.beam * 1.6 : u.def.radius * 0.9) + 3; T1.project(camera);
    if (T1.z > 1 || Math.abs(T1.x) > 1 || Math.abs(T1.y) > 1) continue;
    const sx = (T1.x + 1) / 2 * w, sy = (1 - T1.y) / 2 * h, en = u.team !== me.team, s = u === zoomTarget ? 8 : 5;
    c.fillStyle = WAR ? TEAM_CSS[u.team] : en ? '#ff5a4d' : '#5b93ff'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1;
    c.beginPath();
    if (en) { c.moveTo(sx, sy - s); c.lineTo(sx + s, sy); c.lineTo(sx, sy + s); c.lineTo(sx - s, sy); }
    else { c.moveTo(sx - s, sy - s * 0.7); c.lineTo(sx + s, sy - s * 0.7); c.lineTo(sx, sy + s * 0.8); }
    c.closePath(); c.fill(); c.stroke();
    if (pilot) {                          // a person, not the computer: ringed, with a name tag in their side's colour
      const col = WAR ? TEAM_CSS[u.team] : en ? '#e0443a' : '#2f6fe6';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.arc(sx, sy, s + 7, 0, 6.283); c.stroke();
      c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
      c.font = '800 14px "Trebuchet MS",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const label = pilot.name + (dist > 600 ? '  ' + (dist * 3 / 5280).toFixed(1) + ' mi' : ''), tw = c.measureText(label).width + 14, ty = sy - s - 22;
      c.fillStyle = col; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(sx - tw / 2, ty - 10); c.lineTo(sx + tw / 2, ty - 10); c.lineTo(sx + tw / 2, ty + 10); c.lineTo(sx + 5, ty + 10); c.lineTo(sx, ty + 15);
      c.lineTo(sx - 5, ty + 10); c.lineTo(sx - tw / 2, ty + 10); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.fillText(label, sx, ty + 1); c.textBaseline = 'alphabetic';
    }
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
    c.fillStyle = WAR ? ownerCss(p.owner) : p.owner < 0 ? '#f2f0e0' : p.owner === ALLY ? '#5b93ff' : '#ff5a4d'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(sx - 5, sy - 12); c.lineTo(sx + 9, sy - 7); c.lineTo(sx - 5, sy - 2); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(sx - 5, sy - 13); c.lineTo(sx - 5, sy + 4); c.stroke();
    const label = p.name + ' · ' + (dist * 3 > 5000 ? (dist * 3 / 5280).toFixed(1) + ' mi' : Math.round(dist * 3 / 10) * 10 + ' ft');
    c.lineWidth = 3; c.strokeText(label, sx, sy + 17); c.fillStyle = '#f4f1e2'; c.fillText(label, sx, sy + 17);
    if (p.prog) { const bw = 46; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(sx - bw / 2, sy + 22, bw, 5); c.fillStyle = progCss(p); c.fillRect(sx - bw / 2, sy + 22, bw * Math.min(1, Math.abs(p.prog)), 5); }
  }
  const lk = state === 'playing' ? playerLock() : null;
  if (lk) {                                 // missile seeker lock box
    T1.copy(lk.pos); T1.y += lk.def.centerY || 0; T1.project(camera);
    if (T1.z < 1) {
      const sx = (T1.x + 1) / 2 * w, sy = (1 - T1.y) / 2 * h, ready = me.unit.cdAlt <= 0, b = 16;
      c.strokeStyle = ready ? '#ff3b30' : 'rgba(255,255,255,.6)'; c.lineWidth = 2; c.strokeRect(sx - b, sy - b, b * 2, b * 2);
      c.fillStyle = c.strokeStyle; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)';
      const t = ready ? 'LOCK' : 'RELOADING'; c.strokeText(t, sx, sy - b - 5); c.fillText(t, sx, sy - b - 5);
    }
  }
  if (me.unit && projs.some(p => p.kind === 'aam' && p.tgt === me.unit) && time % 0.5 < 0.32) {
    c.font = '800 20px "Trebuchet MS",sans-serif'; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.7)'; c.fillStyle = '#ff3b30';
    c.strokeText('MISSILE INBOUND · TURN HARD', w / 2, h * 0.3); c.fillText('MISSILE INBOUND · TURN HARD', w / 2, h * 0.3);
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
    const wx = (x / w * 2 - 1) * MAP.x, wz = (y / h * 2 - 1) * MAP.z, t = terrainH(wx, wz);
    b.fillStyle = t > 94 ? '#dcdcd6' : t > 34 ? '#7d735f' : t > 0.5 && forestAt(wx, wz) > 0.3 ? '#2f4c29' : t > 9 ? '#4f6b3c' : t > 0.5 ? '#46663a' : t > -3 ? '#8a8560' : t > -14 ? '#1c4a66' : '#17405a'; b.fillRect(x, y, 2, 2);
  }
  return mapBgCv;
}
function drawFrontLine(c, X, Z, lw) {
  if (WAR) return;
  const path = frontPath();
  c.beginPath(); path.forEach((q, i) => c[i ? 'lineTo' : 'moveTo'](X(q[0]), Z(q[1])));
  c.lineJoin = 'round'; c.strokeStyle = 'rgba(0,0,0,.65)'; c.lineWidth = lw + 2; c.stroke();
  c.setLineDash([7, 5]); c.strokeStyle = '#ffd24a'; c.lineWidth = lw; c.stroke(); c.setLineDash([]);
}
function drawPointDots(c, X, Z, r, names) {
  for (const p of POINTS) {
    const x = X(p.x), z = Z(p.z);
    c.beginPath(); c.arc(x, z, r, 0, 6.3); c.fillStyle = ownerCss(p.owner); c.fill();
    c.lineWidth = 1.5; c.strokeStyle = p.contest ? '#ffd24a' : '#101010'; c.stroke();
    if (p.prog) { c.beginPath(); c.arc(x, z, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.abs(p.prog) * 6.283); c.strokeStyle = progCss(p, true); c.lineWidth = 2.5; c.stroke(); }
    if (names) { c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(p.name, x, z + r + 13); c.fillStyle = '#f4f1e2'; c.fillText(p.name, x, z + r + 13); }
  }
}
function drawUnitDots(c, X, Z, k) {
  const fogR = 1500 * World.vis;
  for (const u of units) {
    if (u === me.unit || u.def.model === 'outpost' || u.def.model === 'seafort') continue;
    if (u.team !== me.team && World.vis < 0.6 && focus && hdist(u.pos, focus) > fogR && u.def.domain !== 'bld') continue;
    if (u.team !== me.team && u.def.sub && u.dive > 0.5 && focus && hdist(u.pos, focus) > 450) continue;
    c.fillStyle = WAR ? lightCss(u.team) : u.team === ALLY ? '#8fb8ff' : '#ff8a7a';
    const x = X(u.pos.x), z = Z(u.pos.z);
    if (u.def.model === 'airport') c.fillRect(x - 9 * k, z + 1, 18 * k, 2);
    if (u.def.domain === 'bld') { const q = (u.def.model === 'hq' ? 7 : 4) * k; c.fillRect(x - q / 2, z - q / 2, q, q); }
    else if (u.def.domain === 'air') { c.beginPath(); c.moveTo(x, z - 3 * k); c.lineTo(x + 3 * k, z + 2 * k); c.lineTo(x - 3 * k, z + 2 * k); c.fill(); }
    else { c.beginPath(); c.arc(x, z, (u.def.domain === 'sea' ? 3 : 2) * k, 0, 6.3); c.fill(); }
  }
  drawPilots(c, X, Z, 4, true);
}
// other people's vehicles on a map: a white ring and their name
function drawPilots(c, X, Z, r, names) {
  for (const u of units) {
    const pilot = Online.pilots.get(u.id); if (!pilot || (pilot.team !== me.team && hdist(u.pos, focus || u.pos) > 1500 * World.vis)) continue;
    const x = X(u.pos.x), z = Z(u.pos.z);
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, z, r, 0, 6.3); c.stroke();
    if (!names) continue;
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(pilot.name, x, z - r - 3);
    c.fillStyle = WAR ? lightCss(pilot.team) : pilot.team === ALLY ? '#bcd4ff' : '#ffb3a8'; c.fillText(pilot.name, x, z - r - 3);
  }
}
// the corner map shows the ground around you; M opens the whole campaign
function drawMini() {
  const cv = $('mini'), w = cv.width, h = cv.height, c = miniCtx, bg = mapBg();
  const span = 1500, spanZ = span * h / w, f = focus ? focus : WAR ? (selCol < 0 ? BASE[me.team] : POINTS[selCol]) : selCol < 0 ? ENG[1] : PT(selCol, 1);
  const cx = clamp(f.x, -MAP.x + span, MAP.x - span), cz = clamp(f.z, -MAP.z + spanZ, MAP.z - spanZ);
  const kx = bg.width / (2 * MAP.x), kz = bg.height / (2 * MAP.z);
  c.drawImage(bg, (cx - span + MAP.x) * kx, (cz - spanZ + MAP.z) * kz, 2 * span * kx, 2 * spanZ * kz, 0, 0, w, h);
  const X = x => (x - cx + span) / (2 * span) * w, Z = z => (z - cz + spanZ) / (2 * spanZ) * h;
  c.fillStyle = 'rgba(20,20,20,.8)'; for (const k of wrecks) c.fillRect(X(k.mesh.position.x) - 1, Z(k.mesh.position.z) - 1, 2, 2);
  c.fillStyle = '#fff'; for (const b of World.icebergs) if (b.k > 0.3) { c.beginPath(); c.arc(X(b.x), Z(b.z), 2, 0, 6.3); c.fill(); }
  drawFrontLine(c, X, Z, 1.5);
  c.font = '700 9px "Trebuchet MS",sans-serif'; c.textAlign = 'center';
  drawPointDots(c, X, Z, 5, true); drawUnitDots(c, X, Z, 1);
  if (focus) {
    const p = focus, x = X(p.x), z = Z(p.z);
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, z, 4, 0, 6.3); c.stroke();
    c.beginPath(); c.moveTo(x, z); c.lineTo(x + Math.sin(camYaw) * 12, z + Math.cos(camYaw) * 12); c.stroke();
  }
}
// ---- campaign map: the whole theatre from above, drawn from the same outlines the terrain is built from
let euBg = null;
function euXY(lon, lat, w, h) { return [(lon - GEO.lon0) / (GEO.lon1 - GEO.lon0) * w, (GEO.lat1 - lat) / (GEO.lat1 - GEO.lat0) * h]; }
function euWorld(x, z, w, h) { return [(x / MAP.x + 1) / 2 * w, (z / MAP.z + 1) / 2 * h]; }
function euLane(l, idx, w, h) { const q = lanePos(l, idx); return euWorld(q.x, q.z, w, h); }
function euPoint(p, w, h) { return euWorld(p.x, p.z, w, h); }
function euFront(l, w, h) { return euLane(l, frontIdx(l), w, h); }
function drawEuBg(w, h) {
  euBg = document.createElement('canvas'); euBg.width = w; euBg.height = h; const c = euBg.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#163a52'); g.addColorStop(1, '#1d4a66'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;                 // graticule
  const gs = TH.grid;
  for (let lon = Math.ceil(GEO.lon0 / gs[0]) * gs[0]; lon < GEO.lon1; lon += gs[0]) { const q = euXY(lon, 0, w, h); c.beginPath(); c.moveTo(q[0], 0); c.lineTo(q[0], h); c.stroke(); }
  for (let lat = Math.ceil(GEO.lat0 / gs[1]) * gs[1]; lat < GEO.lat1; lat += gs[1]) { const q = euXY(0, lat, w, h); c.beginPath(); c.moveTo(0, q[1]); c.lineTo(w, q[1]); c.stroke(); }
  // the land (outlines plus any land / water stamps) as a mask, then shallows, the beach line and the land on top
  const mask = document.createElement('canvas'); mask.width = w; mask.height = h;
  paintLand(mask.getContext('2d'), LAND, TERRAIN, (lon, lat) => euXY(lon, lat, w, h), w / (2 * MAP.x), '#000');
  const layer = (col, grow) => {
    const L = document.createElement('canvas'); L.width = w; L.height = h; const lc = L.getContext('2d');
    for (let a = 0; a < 8 && grow; a++) lc.drawImage(mask, Math.cos(a * 0.785) * grow, Math.sin(a * 0.785) * grow);
    lc.drawImage(mask, 0, 0); lc.globalCompositeOperation = 'source-in'; lc.fillStyle = col; lc.fillRect(0, 0, w, h); return L;
  };
  c.globalAlpha = 0.25; c.drawImage(layer('rgb(120,170,190)', 4.5), 0, 0); c.globalAlpha = 1;   // shallows
  c.drawImage(layer('#c9c08f', 1.2), 0, 0); c.drawImage(layer('#4b6a3d', 0), 0, 0);
  // relief and woods, shaded from the real terrain heights
  if (TERRAIN.some(s => s[0] === 'mtn' || s[0] === 'hill' || s[0] === 'forest')) {
    const rw = 560, rh = 300, hs = new Float32Array(rw * rh), rc = document.createElement('canvas'); rc.width = rw; rc.height = rh;
    const X = i => ((i + 0.5) / rw * 2 - 1) * MAP.x, Z = j => ((j + 0.5) / rh * 2 - 1) * MAP.z;
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) hs[j * rw + i] = terrainH(X(i), Z(j));
    const im = rc.getContext('2d').createImageData(rw, rh), px = im.data;
    for (let j = 1; j < rh - 1; j++) for (let i = 1; i < rw - 1; i++) {
      const k = j * rw + i, t = hs[k]; if (t < 0.8) continue;
      const fo = forestAt(X(i), Z(j)), shade = clamp((hs[k - 1] - hs[k + 1] + hs[k - rw] - hs[k + rw]) * 0.025, -0.6, 0.6);
      let r = 75, g = 106, b = 61, a = 0;
      if (fo > 0.15) { r = 38; g = 70; b = 36; a = Math.min(1, fo * 1.5) * 0.85; }
      if (t > 28) { const q = Math.min(1, (t - 28) / 34); r += (128 - r) * q; g += (114 - g) * q; b += (88 - b) * q; a = Math.max(a, q * 0.9); }
      if (t > 94) { const q = Math.min(1, (t - 94) / 12); r += (236 - r) * q; g += (236 - g) * q; b += (232 - b) * q; }
      if (Math.abs(shade) > 0.02) { a = Math.max(a, Math.min(0.9, Math.abs(shade) * 1.4)); const s = shade > 0 ? 255 : 0, q = Math.abs(shade) * 0.6; r += (s - r) * q; g += (s - g) * q; b += (s - b) * q; }
      const o = k * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a * 255;
    }
    rc.getContext('2d').putImageData(im, 0, 0); c.drawImage(rc, 0, 0, w, h);
  }
  const R = rng32(1944);
  for (let i = 0; i < 2600; i++) { c.fillStyle = R() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,220,.04)'; c.fillRect(R() * w, R() * h, 2 + R() * 3, 2 + R() * 3); }
  c.textAlign = 'center';
  for (const L of TH.labels) {
    const q = euXY(L[1], L[2], w, h), sea = !!L[4];
    c.font = (sea ? 'italic ' : '700 ') + L[3] + 'px "Trebuchet MS",sans-serif'; c.fillStyle = sea ? 'rgba(170,205,225,.6)' : 'rgba(20,30,15,.45)';
    c.fillText(sea ? L[0] : L[0].split('').join(' '), q[0], q[1]);
  }
}
function drawCamp() {
  const cv = $('camp'), w = cv.width, h = cv.height, c = campCtx;
  if (!euBg) drawEuBg(w, h);
  c.drawImage(euBg, 0, 0);
  if (WAR) return drawWarMap(c, w, h);
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
  if (invasionOpen()) {                    // the invasion route to the Allied homeland
    const a = euPoint(PT(INVADE.col, INVADE.lane), w, h), b = euPoint(ENG[ENG.length - 1], w, h);
    c.setLineDash([3, 5]); c.strokeStyle = '#ff8a7a'; c.lineWidth = 2; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.setLineDash([]);
  }
  c.textAlign = 'center';
  const text = (t, x, y, col) => { c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(t, x, y); c.fillStyle = col || '#f4f1e2'; c.fillText(t, x, y); };
  c.font = '700 11px "Trebuchet MS",sans-serif';
  for (const team of [ALLY, AXIS]) {
    const q = euWorld(BASE[team].x, BASE[team].z, w, h);
    c.fillStyle = team === ALLY ? '#3f7dff' : '#f04a3c'; c.strokeStyle = '#101010'; c.lineWidth = 1.5; c.fillRect(q[0] - 9, q[1] - 9, 18, 18); c.strokeRect(q[0] - 9, q[1] - 9, 18, 18);
    c.fillStyle = '#fff'; c.fillText('HQ', q[0], q[1] + 4);
    text(TH.hqLabels[team], q[0], TH.hqBelow && TH.hqBelow[team] ? q[1] + 22 : q[1] - 15);
  }
  if (state !== 'menu') for (const u of units) {
    if (u === me.unit || u.def.domain === 'bld') continue;
    if (u.team !== me.team && u.def.sub && u.dive > 0.5) continue;
    const q = euWorld(u.pos.x, u.pos.z, w, h); c.fillStyle = u.team === ALLY ? '#bcd4ff' : '#ffb3a8'; c.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3);
  }
  c.font = '700 11px "Trebuchet MS",sans-serif'; c.textAlign = 'center';
  drawPilots(c, x => euWorld(x, 0, w, h)[0], z => euWorld(0, z, w, h)[1], 6, true);
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
  if (state !== 'menu' && focus) { const q = euWorld(focus.x, focus.z, w, h); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(q[0], q[1], 7, 0, 6.3); c.stroke(); }
}
function drawWarMap(c, w, h) {
  const P = p => euPoint(p, w, h);
  const text = (t, x, y, col) => { c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(t, x, y); c.fillStyle = col || '#f4f1e2'; c.fillText(t, x, y); };
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const p of POINTS) for (const i of p.from) {     // the routes between points: bright where you can attack along them
    const q = POINTS[i]; if (i > p.i && q.from.includes(p.i)) continue;
    const a = P(p), b = P(q), open = q.owner === me.team && p.owner !== me.team;
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
    c.strokeStyle = open ? 'rgba(242,193,78,.75)' : p.sea ? 'rgba(150,200,230,.22)' : 'rgba(240,235,210,.22)'; c.lineWidth = open ? 2.5 : 1.5;
    c.setLineDash(open ? [] : [4, 5]); c.stroke(); c.setLineDash([]);
  }
  c.textAlign = 'center'; c.font = '700 11px "Trebuchet MS",sans-serif';
  for (const t of TEAMS) {                                  // every base, in its army's colour, named after its warlord
    const q = euWorld(BASE[t].x, BASE[t].z, w, h), sel = t === me.team && selCol < 0;
    c.fillStyle = TEAM_CSS[t]; c.strokeStyle = sel ? '#f2c14e' : '#101010'; c.lineWidth = sel ? 3 : 1.5;
    c.fillRect(q[0] - 9, q[1] - 9, 18, 18); c.strokeRect(q[0] - 9, q[1] - 9, 18, 18);
    c.fillStyle = '#fff'; c.fillText('HQ', q[0], q[1] + 4);
    text(lordName(t) + (t === me.team ? ' (you)' : '') + ' · ' + Math.round(Score[t]), q[0], q[1] + (BASE[t].z > 0 ? 24 : -15), t === me.team ? '#f2c14e' : lightCss(t));
  }
  if (state !== 'menu') for (const u of units) {
    if (u === me.unit || u.def.domain === 'bld' || (u.team !== me.team && u.def.sub && u.dive > 0.5)) continue;
    const q = euWorld(u.pos.x, u.pos.z, w, h); c.fillStyle = lightCss(u.team); c.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3);
  }
  drawPilots(c, x => euWorld(x, 0, w, h)[0], z => euWorld(0, z, w, h)[1], 6, true);
  for (const p of POINTS) {
    const q = P(p), r = p.cit ? 9 : 7, sel = p.i === selCol;
    if (sel) { c.beginPath(); c.arc(q[0], q[1], r + 7, 0, 6.3); c.strokeStyle = '#f2c14e'; c.lineWidth = 3; c.stroke(); }
    c.beginPath(); c.arc(q[0], q[1], r, 0, 6.3); c.fillStyle = ownerCss(p.owner); c.fill();
    c.lineWidth = 1.5; c.strokeStyle = p.contest ? '#ffd24a' : '#101010'; c.stroke();
    if (p.cit) { c.fillStyle = '#101010'; c.font = '700 10px "Trebuchet MS",sans-serif'; c.fillText('★', q[0], q[1] + 4); }
    if (p.prog) { c.beginPath(); c.arc(q[0], q[1], r + 3, -Math.PI / 2, -Math.PI / 2 + Math.abs(p.prog) * 6.283); c.strokeStyle = progCss(p, true); c.lineWidth = 2.5; c.stroke(); }
    c.font = (p.cit ? '700 11px' : '700 10px') + ' "Trebuchet MS",sans-serif';
    const side = p.cit && Math.abs(p.x) > 60 ? Math.sign(p.x) : 0;    // the Citadel's lower points are labelled to the side
    c.textAlign = side > 0 ? 'left' : side < 0 ? 'right' : 'center';
    if (p.cit || sel || p.owner === me.team || canCap(p, me.team)) text(p.name, q[0] + side * (r + 5), side ? q[1] + 4 : p.cit ? q[1] - r - 6 : q[1] + r + 12, sel ? '#f2c14e' : p.owner === me.team ? '#f4f1e2' : 'rgba(244,241,226,.7)');
    c.textAlign = 'center';
  }
  if (state !== 'menu' && focus) { const q = euWorld(focus.x, focus.z, w, h); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(q[0], q[1], 7, 0, 6.3); c.stroke(); }
}
// Warlords: every army's score, best first
function renderScores() {
  const el = $('scores'); if (!WAR) { el.style.display = 'none'; return; }
  el.style.display = '';
  const order = TEAMS.slice().sort((a, b) => Score[b] - Score[a]);
  el.innerHTML = order.map(t => `<i style="background:${TEAM_CSS[t]}"></i><span${t === me.team ? ' class="me"' : ''}></span><b>${Math.round(Score[t])}</b>`).join('');
  el.querySelectorAll('span').forEach((sp, i) => { const t = order[i]; sp.textContent = lordName(t) + ' · ' + ownedBy(t) + ' pts'; });
}
function updateHUD(dt) {
  if (hurtFlash > 0) hurtFlash -= dt;
  if (nukeFlash > 0) nukeFlash -= dt * 0.6;
  hudT -= dt; if (hudT > 0) return; hudT = 0.12;
  if (touchMode) $('tZoom').classList.toggle('on', input.zoom);
  $('money').textContent = '$' + Math.floor(me.money).toLocaleString();
  const bt = Math.max(0, Math.ceil(battleT));
  $('battle').textContent = `${WAR ? 'Match' : 'Operation'} ends in ${Math.floor(bt / 60)}:${('0' + bt % 60).slice(-2)} · +${me.stats.credits.toLocaleString()} credits`;
  renderScores();
  const inc = incomeOf(me.team);
  $('income').textContent = `+$${inc} every ${INCOME_PERIOD}s from buildings`;
  const s = World.info;
  $('season').textContent = `${s.icon} ${s.name}`; $('seasonDesc').textContent = s.desc;
  $('seasonBar').style.width = (World.remaining / SEASON_LEN * 100) + '%';
  const wx = $('wx'); wx.className = s.wx || '';
  let workers = 0, residents = 0, gunners = 0, sailors = 0, merch = 0, fac = 0, hou = 0;
  for (const u of units) {
    if (u.team !== me.team) continue; const d = u.def;
    if (d.domain === 'bld') { if (u.built < 1) continue; if (d.job === 'workers') { workers += d.people; if (d.model === 'factory') fac++; } else if (d.job === 'residents') { residents += d.people; hou++; } else if (d.job === 'gunners') gunners += d.people; }
    else if (d.domain === 'sea') { sailors += d.crew; if (d.role === 'merchant') merch++; if (d.aa) gunners += Math.round(d.crew * 0.1); }
    else if (d.aa) gunners += d.crew - 2;
  }
  $('people').innerHTML = `<span>Factory workers (${fac} factories)</span><b>${workers}</b><span>Residents paying bills (${hou} houses)</span><b>${residents}</b><span>Sailors at sea (${merch} merchants)</span><b>${sailors.toLocaleString()}</b><span>Gunners on duty</span><b>${gunners}</b>`;
  const m = $('morale');
  if (s.reload > 1) { m.textContent = 'Crew morale: soaked and grumbling (reloads 35% slower)'; m.style.color = '#9fc4e0'; }
  else { m.textContent = 'Crew morale: steady'; m.style.color = '#b9d48a'; }
  const u = me.unit;
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
    if (cp.post) txt = cp.owner === me.team ? `${cp.name} · held by the ${SIDE_PL[me.team]}` : `${cp.name} · destroy the ${TEAM_NAME[cp.owner]} command post to open it for capture`;
    else if (!fits) txt = `${cp.name} · open: only ${cp.sea ? 'warships' : 'ground forces'} can capture it`;
    else if (cp.contest) txt = `${cp.name} · contested! Clear the enemy out`;
    else if (WAR && !canCap(cp, me.team)) txt = `${cp.name} · cut off: hold a point next to it first (see the map)`;
    else if (!canCap(cp, me.team)) { const k = me.team === ALLY ? -1 : 1, n = cp.eng ? ENG[cp.col + k] : PT(cp.col + k, cp.lane); txt = n ? `${cp.name} · cut off: take ${n.name} first` : `${cp.name} · cut off`; }
    else { txt = `Capturing ${cp.name}`; k = Math.max(0, cp.prog); }
    capEl.style.display = 'block'; $('capTxt').textContent = txt; $('capBar').style.width = k * 100 + '%'; $('capBar').parentNode.style.display = k > 0 || txt.startsWith('Capturing') ? '' : 'none';
  } else capEl.style.display = 'none';
  const tp = $('target');
  if (zoomTarget && !zoomTarget.dead) {
    tp.style.display = 'block'; const d = zoomTarget.def;
    $('tkind').textContent = TEAM_NAME[zoomTarget.team] + ' ' + ({ air: 'aircraft', land: 'ground unit', sea: 'vessel', bld: 'building' }[d.domain]);
    $('tname').textContent = d.name; $('thp').firstElementChild.style.width = clamp(zoomTarget.hp / zoomTarget.maxHp * 100, 0, 100) + '%';
    $('tdist').textContent = Math.round(zoomTarget.pos.distanceTo(focus) * 3) + ' ft';
  } else tp.style.display = 'none';
}

// -------------------------------------------------------------- setup & loop
let lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;
  // the shop and the map pause single player; an online battle runs on the server and never pauses
  const running = Online.code ? true : state === 'playing' || state === 'dead' || state === 'over';
  if (running) {
    fillControls();
    if (Online.code) Online.frame(dt); else step(dt);
    Scenery.update(dt); updateWrecks(dt); updateFx(dt);
    if (state === 'dead') { deadT -= dt; if (deadT <= 0 && !$('menu').classList.contains('on')) showRespawn(); }
  }
  syncView(running ? dt : 0);
  updateCamera(dt); Scenery.render(dt, camera, now / 1000);
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
  tap('tDive', diveKey);
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
    if (e.code === 'KeyC' && !e.repeat) diveKey();
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
  // single player: both armies field the tiers you have unlocked, and you fight for the Allies.
  // ?join=CODE: the battle runs on the game server instead, and this page only shows it (net.js).
  const join = new URLSearchParams(location.search).get('join');
  Rules.tiers = Account.data.tiers;
  me = addPlayer(ALLY, { name: 'You', tiers: Account.data.tiers });
  wireOut();
  if (join) { for (const p of POINTS) { p.isl = islandOf(p.x, p.z); p.y = p.sea ? 0 : terrainH(p.x, p.z); } menuTab = 'Play together'; }
  else setupTeams();
  Scenery.init(scene); initPoints();
  if (join) Online.start(join.toUpperCase());
  $('overBtn').onclick = () => { if (Online.code) Online.leave(); else location.reload(); };
  bindInput(); bindTouch(); resize();
  selCol = frontCol();
  $('camp').addEventListener('click', e => {
    const cv = e.currentTarget, r = cv.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * cv.width, my = (e.clientY - r.top) / r.height * cv.height;
    let c = 0, bd = 1e9;                   // the sector whose nearest point is closest to the click
    for (const p of POINTS) { const q = euPoint(p, cv.width, cv.height), dd = Math.hypot(q[0] - mx, q[1] - my); if (dd < bd) { bd = dd; c = secOf(p); } }
    if (WAR) { const q = euWorld(BASE[me.team].x, BASE[me.team].z, cv.width, cv.height); if (Math.hypot(q[0] - mx, q[1] - my) < bd) c = -1; }
    if (canDeployIn(c)) { selCol = c; renderMenu(); }
    else $('sectorInfo').innerHTML = WAR ? `<b>${secName(c)}</b> is not yours: you can deploy at your base or at a point you hold.`
      : `The <b>${secName(c)}</b> sector is not in ${TEAM_NAME[me.team]} hands: you can only deploy where the ${SIDE_PL[me.team]} hold a point.`;
  });
  $('helpCampaign').innerHTML = TH.help;
  $('resetLink').onclick = () => { if (confirm('Start again from scratch? Every unlock, credit and the campaign map is lost.')) { Account.reset(); location.reload(); } };
  renderMenu();
  requestAnimationFrame(loop);
}
// debug / test handle
window.G = { units, wrecks, projs, players, World, step(n, dt) { for (let i = 0; i < n; i++) step(dt || 0.033); }, get me() { return me; }, get player() { return me.unit; }, get money() { return me.money; }, set money(v) { me.money = v; }, get state() { return state; }, startAs, deploy, buy, toggleShop, toggleMap, switchVehicle, damage, kill, spawnAt, spawn, airlift, sealift, requisition, setControl, Account, POINTS, PT, capture, endBattle, reach, stage, frontPos, ferry, ENG, engObjective, calaisHeld, invasionOpen, landZone, islandOf, TH, navTo, sdf, get battleT() { return battleT; }, set battleT(v) { battleT = v; }, get selCol() { return selCol; }, set selCol(v) { selCol = v; }, get stats() { return me.stats; }, get lastBought() { return lastBought; }, get deployCd() { return me.deployCd; }, set deployCd(v) { me.deployCd = v; } };
init();

'use strict';
// ---------- procedural low-poly models (nose / bow points +Z) ----------
const MatCache = {};
function mat(c) { return MatCache[c] || (MatCache[c] = new THREE.MeshLambertMaterial({ color: c })); }
function part(g, geo, m, x, y, z) { const me = new THREE.Mesh(geo, m); me.position.set(x || 0, y || 0, z || 0); g.add(me); return me; }
function bx(g, w, h, d, m, x, y, z) { return part(g, new THREE.BoxGeometry(w, h, d), m, x, y, z); }
// cylinder: rFront = radius at +axis end
function cyl(g, rFront, rBack, len, m, x, y, z, axis) {
  const geo = new THREE.CylinderGeometry(rFront, rBack, len, 10);
  if (axis === 'x') geo.rotateZ(-Math.PI / 2); else if (axis !== 'y') geo.rotateX(Math.PI / 2);
  return part(g, geo, m, x, y, z);
}
const FIG_GEO = new THREE.BoxGeometry(0.5, 1.5, 0.4);
const HEAD_GEO = new THREE.SphereGeometry(0.28, 6, 5);
const SKIN = 0xd9a77a;
function figure(color) {
  const m = new THREE.Mesh(FIG_GEO, mat(color));
  const head = new THREE.Mesh(HEAD_GEO, mat(SKIN)); head.position.y = 1.0; m.add(head);
  return m;
}
function teamMat(team) { return new THREE.MeshLambertMaterial({ color: TEAM_COL[team] }); }
const GLASS = new THREE.MeshLambertMaterial({ color: 0x9fd0e8 });
const PROP = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.35 });

function mFighter(team, d) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = mat(team === ALLY ? 0x5d6b45 : 0x66707a), dark = mat(0x2a2a2a);
  cyl(g, 0.6, 0.9, 6, body, 0, 0, 0);
  cyl(g, 0.15, 0.6, 1.2, team === AXIS ? mat(0xd8b21a) : dark, 0, 0, 3.6);
  cyl(g, 0.9, 0.25, 4.5, body, 0, 0, -5.2);
  bx(g, 11, 0.18, 2, body, 0, -0.25, 0.4);
  bx(g, 1.3, 0.2, 2.02, tm, 5.2, -0.25, 0.4); bx(g, 1.3, 0.2, 2.02, tm, -5.2, -0.25, 0.4);
  bx(g, 4, 0.12, 1.1, body, 0, 0.1, -6.8);
  bx(g, 0.14, 1.6, 1.2, tm, 0, 0.8, -6.9);
  const c = part(g, new THREE.SphereGeometry(0.65, 8, 6), GLASS, 0, 0.65, -0.4); c.scale.set(0.8, 0.8, 1.7);
  cyl(g, 1.7, 1.7, 0.05, PROP, 0, 0, 4.25);
  if (d.role === 'torpedo') cyl(g, 0.3, 0.3, 4, dark, 0, -1, 0);
  if (d.twin) for (const x of [-2.3, 2.3]) {
    cyl(g, 0.5, 0.55, 5, body, x, -0.1, 1.2); cyl(g, 0.5, 0.2, 7, body, x, -0.1, -4.6);
    cyl(g, 1.5, 1.5, 0.05, PROP, x, -0.1, 3.75); bx(g, 0.12, 1.2, 1, tm, x, 0.6, -7.2);
  }
  if (d.big) g.scale.setScalar(d.big);
  g.userData.teamMat = tm; return g;
}
function mBomber(team, d) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = mat(d.silver ? 0xc2c7cc : d.cargoLook ? (team === ALLY ? 0x7d8468 : 0x8a8f94) : team === ALLY ? 0x6b7450 : 0x5a646d), dark = mat(0x2a2a2a);
  cyl(g, 1.3, 1.5, 14, body, 0, 0, 1);
  const nose = part(g, new THREE.SphereGeometry(1.3, 8, 6), d.cargoLook ? body : GLASS, 0, 0, 8);
  nose.scale.z = 1.3;
  cyl(g, 1.5, 0.5, 9, body, 0, 0, -10.5);
  bx(g, 32, 0.35, 4.5, body, 0, 0, 1.5);
  bx(g, 2.4, 0.37, 4.52, tm, 14.8, 0, 1.5); bx(g, 2.4, 0.37, 4.52, tm, -14.8, 0, 1.5);
  for (const x of d.engines === 2 ? [-6, 6] : [-10, -5, 5, 10]) {
    cyl(g, 0.75, 0.75, 3.4, dark, x, -0.2, 3.6);
    cyl(g, 1.8, 1.8, 0.05, PROP, x, -0.2, 5.4);
  }
  bx(g, 11, 0.2, 2.6, body, 0, 0.3, -14);
  bx(g, 0.25, 4, 3.2, tm, 0, 2.2, -14);
  bx(g, 0.9, 0.5, 2.4, GLASS, 0, 1.4, 4.5);
  const t = part(g, new THREE.SphereGeometry(0.7, 6, 5), GLASS, 0, 1.5, -1);
  t.scale.y = 0.7; t.visible = !d.cargoLook;
  if (d.cargoLook) bx(g, 2.72, 0.7, 6, tm, 0, 0, -2);
  if (d.big) g.scale.setScalar(d.big);
  g.userData.teamMat = tm; return g;
}
function mB52(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = mat(0xb9bec4), dark = mat(0x3a3d42), belly = mat(0x8d9299);
  cyl(g, 2.1, 2.1, 36, body, 0, 0, 0);
  cyl(g, 0.6, 2.1, 6, body, 0, 0, 21);
  cyl(g, 2.1, 0.7, 10, body, 0, 0, -23);
  bx(g, 2.6, 0.8, 3, GLASS, 0, 1.5, 18);
  bx(g, 2.2, 0.5, 20, belly, 0, -2, 0);
  for (const s of [1, -1]) {
    const w = bx(g, 30, 0.5, 6.5, body, s * 14, 1.6, -5);
    w.rotation.y = s * 0.55;
    const tip = bx(g, 3, 0.52, 3.6, tm, s * 26.5, 1.6, -13); tip.rotation.y = s * 0.55;
    for (const x of [9, 18]) {
      const z = -x * 0.6 + 4;
      bx(g, 0.3, 1.4, 3, dark, s * x, 0.7, z);
      cyl(g, 0.75, 0.75, 4.2, dark, s * x - 0.85, -0.2, z + 1.5);
      cyl(g, 0.75, 0.75, 4.2, dark, s * x + 0.85, -0.2, z + 1.5);
    }
    const tp = bx(g, 9, 0.3, 3.5, body, s * 4.5, 0.6, -25); tp.rotation.y = s * 0.45;
  }
  bx(g, 0.45, 9, 6, body, 0, 5.5, -24);
  bx(g, 0.5, 2.2, 6.05, tm, 0, 8.6, -24);
  g.userData.teamMat = tm; return g;
}
function mTank(team, d) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = mat(team === ALLY ? 0x56633a : 0x7b745c), dark = mat(0x26261f);
  bx(g, 3.2, 1.1, 6, body, 0, 1.0, 0);
  bx(g, 0.85, 1.0, 6.5, dark, 1.7, 0.5, 0); bx(g, 0.85, 1.0, 6.5, dark, -1.7, 0.5, 0);
  bx(g, 2.6, 0.3, 1.6, body, 0, 1.6, -2);
  const t = new THREE.Group(); t.position.set(0, 1.55, 0.2);
  bx(t, 2.3, 0.95, 2.7, body, 0, 0.47, 0);
  cyl(t, 0.17, 0.17, 4.2, dark, 0, 0.5, 3.2);
  bx(t, 0.9, 0.16, 0.9, tm, 0, 1.0, -0.5);
  g.add(t); g.userData.turrets = [t];
  if (d.big) g.scale.setScalar(d.big);
  g.userData.teamMat = tm; return g;
}
function mHalftrack(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = mat(team === ALLY ? 0x56633a : 0x7b745c), dark = mat(0x26261f);
  bx(g, 3, 1.2, 6.4, body, 0, 1.1, 0);
  bx(g, 2.8, 1.1, 1.8, body, 0, 2.1, 1.6);
  bx(g, 0.8, 0.9, 3.2, dark, 1.6, 0.45, -1.4); bx(g, 0.8, 0.9, 3.2, dark, -1.6, 0.45, -1.4);
  cyl(g, 0.55, 0.55, 0.5, dark, 1.6, 0.55, 2.3, 'x'); cyl(g, 0.55, 0.55, 0.5, dark, -1.6, 0.55, 2.3, 'x');
  const t = new THREE.Group(); t.position.set(0, 1.8, -1.6);
  bx(t, 1.6, 0.8, 1.4, dark, 0, 0.4, 0);
  for (const x of [-0.6, -0.25, 0.25, 0.6]) { const b = cyl(t, 0.07, 0.07, 2.6, dark, x, 1.2, 1.2); b.rotation.x = -0.5; }
  bx(t, 1.7, 0.12, 0.5, tm, 0, 0.86, -0.4);
  g.add(t); g.userData.turrets = [t];
  g.userData.teamMat = tm; return g;
}
function mSquad(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const uni = mat(team === ALLY ? 0x5a6a3c : 0x6a6d60), legs = mat(0x3b3b30), dark = mat(0x1f1f1f);
  const helm = mat(team === ALLY ? 0x3f4a2a : 0x3c4046);
  const soldiers = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Group();
    bx(s, 0.62, 0.9, 0.36, uni, 0, 1.25, 0);
    bx(s, 0.5, 0.8, 0.3, legs, 0, 0.4, 0);
    part(s, HEAD_GEO, mat(SKIN), 0, 1.95, 0);
    const h = part(s, new THREE.SphereGeometry(0.32, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), helm, 0, 1.98, 0);
    h.scale.y = 0.9;
    bx(s, 0.08, 0.08, 1.3, dark, 0.36, 1.35, 0.45);
    bx(s, 0.16, 0.22, 0.4, tm, -0.36, 1.45, 0);
    s.position.set((i % 2 ? 1 : -1) * 1.3 + (Math.random() - 0.5) * 0.6, 0, (Math.floor(i / 2) - 1.5) * 2.2 + (Math.random() - 0.5) * 0.5);
    s.userData.ph = Math.random() * 6;
    g.add(s); soldiers.push(s);
  }
  g.userData.soldiers = soldiers; g.userData.teamMat = tm; return g;
}
function hullGeo(len, beam, h) {
  const s = new THREE.Shape(), L = len / 2, B = beam / 2;
  s.moveTo(0, -L); s.quadraticCurveTo(B, -L * 0.55, B, -L * 0.1); s.lineTo(B, L * 0.8);
  s.quadraticCurveTo(B * 0.8, L, 0, L); s.quadraticCurveTo(-B * 0.8, L, -B, L * 0.8);
  s.lineTo(-B, -L * 0.1); s.quadraticCurveTo(-B, -L * 0.55, 0, -L);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2); return geo;
}
function mShip(team, d) {
  const g = new THREE.Group(), tm = teamMat(team);
  const len = d.len, beam = d.beam, h = beam * 0.6, deck = h * 0.55;
  const hullM = mat(team === ALLY ? 0x76828e : 0x4d555e), sup = mat(team === ALLY ? 0x94a0ab : 0x626b74), dark = mat(0x2b2f33);
  part(g, hullGeo(len, beam, h), hullM, 0, -h * 0.45, 0);
  bx(g, beam * 0.6, h * 0.6, len * 0.3, sup, 0, deck + h * 0.3, 0);
  bx(g, beam * 0.45, h * 0.6, len * 0.1, sup, 0, deck + h * 0.9, len * 0.09);
  bx(g, beam * 0.47, h * 0.15, len * 0.1 + 0.1, GLASS, 0, deck + h * 1.0, len * 0.09);
  for (let i = 0; i < (d.funnels || 1); i++) cyl(g, beam * 0.11, beam * 0.13, h * 1.2, dark, 0, deck + h * 1.1, -len * 0.02 - i * len * 0.09, 'y');
  cyl(g, 0.2, 0.25, h * 2.4, dark, 0, deck + h * 1.8, len * 0.12, 'y');
  bx(g, beam * 0.5, 0.15, 0.15, dark, 0, deck + h * 2.4, len * 0.12);
  const turrets = [];
  const tz = [];
  for (let i = 0; i < d.turrets[0]; i++) tz.push(len * (0.3 - i * 0.1));
  for (let i = 0; i < d.turrets[1]; i++) tz.push(-len * (0.3 + i * 0.1));
  for (const z of tz) {
    const t = new THREE.Group(); t.position.set(0, deck + (z > 0 && z < len * 0.25 || z < 0 && z > -len * 0.35 ? h * 0.25 : 0), z);
    bx(t, beam * 0.42, h * 0.32, beam * 0.5, sup, 0, h * 0.16, 0);
    cyl(t, beam * 0.03, beam * 0.03, beam * 0.9, dark, beam * 0.09, h * 0.2, beam * 0.6);
    cyl(t, beam * 0.03, beam * 0.03, beam * 0.9, dark, -beam * 0.09, h * 0.2, beam * 0.6);
    g.add(t); turrets.push(t);
  }
  cyl(g, 0.12, 0.12, 5, dark, 0, deck + 2.5, -len * 0.46, 'y');
  bx(g, 0.15, 2.2, 3.4, tm, 0, deck + 4, -len * 0.46 - 1.8);
  bx(g, beam * 0.46, 0.2, len * 0.1, tm, 0, deck + h * 1.22, len * 0.09);
  for (let i = 0; i < 5; i++) {
    const f = figure(team === ALLY ? 0xe8e8e8 : 0x30384a);
    f.position.set((Math.random() - 0.5) * beam * 0.7, deck + 0.75, (Math.random() - 0.5) * len * 0.75);
    if (Math.abs(f.position.x) < beam * 0.32) f.position.x = Math.sign(f.position.x || 1) * beam * 0.38;
    f.userData.person = true; g.add(f);
  }
  g.userData.turrets = turrets; g.userData.teamMat = tm; return g;
}
function mMerchant(team, d) {
  const g = new THREE.Group(), tm = teamMat(team);
  const len = d.len, beam = d.beam, h = beam * 0.7, deck = h * 0.55;
  const hullM = mat(d.mil ? (team === ALLY ? 0x76828e : 0x4d555e) : team === ALLY ? 0x4a4f55 : 0x3b3530), sup = mat(d.mil ? 0x94a0ab : 0xd8d2c0), dark = mat(0x2b2f33);
  part(g, hullGeo(len, beam, h), hullM, 0, -h * 0.45, 0);
  bx(g, beam * 0.7, h * 0.9, len * 0.14, sup, 0, deck + h * 0.45, -len * 0.3);
  cyl(g, beam * 0.1, beam * 0.12, h * 1.1, dark, 0, deck + h * 1.3, -len * 0.3, 'y');
  const cols = d.mil ? [0x56633a, 0x4d5a34, 0x56633a, 0x4d5a34] : [0x8a5a2b, 0x5c7a3a, 0x7a3a2e, 0x8a7a4a];
  for (let i = 0; i < 6; i++) bx(g, beam * 0.32, h * 0.4, len * 0.09, mat(cols[i % 4]), (i % 2 ? 1 : -1) * beam * 0.19, deck + h * 0.2, len * (0.3 - Math.floor(i / 2) * 0.16));
  cyl(g, 0.2, 0.25, h * 2, dark, 0, deck + h, len * 0.38, 'y');
  cyl(g, 0.2, 0.25, h * 2, dark, 0, deck + h, -len * 0.08, 'y');
  bx(g, 0.15, 2.2, 3.4, tm, 0, deck + h * 1.2, -len * 0.45);
  bx(g, beam * 0.72, 0.25, len * 0.14, tm, 0, deck + h * 0.95, -len * 0.3);
  g.userData.teamMat = tm; return g;
}
function mHouse(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  bx(g, 8, 5, 7, mat(team === ALLY ? 0xe6dcc0 : 0xcfc8b8), 0, 2.5, 0);
  const r = part(g, new THREE.ConeGeometry(6.4, 3.4, 4), mat(team === ALLY ? 0x8f3a2a : 0x4a4038), 0, 6.7, 0);
  r.rotation.y = Math.PI / 4; r.scale.z = 0.9;
  bx(g, 1, 2.6, 1, mat(0x6b4a3a), 2.2, 6.8, 1);
  bx(g, 1.4, 2.6, 0.2, mat(0x5a3d22), 0, 1.3, 3.55);
  bx(g, 1.4, 1.3, 0.2, GLASS, -2.5, 3, 3.55); bx(g, 1.4, 1.3, 0.2, GLASS, 2.5, 3, 3.55);
  bx(g, 8.1, 0.5, 7.1, tm, 0, 4.9, 0);
  g.userData.teamMat = tm; return g;
}
function mFactory(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const brick = mat(team === ALLY ? 0x9a5a44 : 0x6f6a64), roof = mat(0x4a4d50);
  bx(g, 20, 8, 13, brick, 0, 4, 0);
  for (let i = 0; i < 4; i++) { const r = bx(g, 4.8, 2.4, 13, roof, -7.5 + i * 5, 8.6, 0); r.rotation.z = 0.35; }
  cyl(g, 0.9, 1.2, 14, brick, 7.5, 7, -4, 'y'); cyl(g, 0.9, 1.2, 12, brick, 4.5, 6, -4, 'y');
  bx(g, 4, 4, 0.3, mat(0x33363a), -5, 2, 6.55);
  for (let i = 0; i < 4; i++) bx(g, 2, 1.6, 0.2, GLASS, 0 + i * 2.6, 5, 6.55);
  bx(g, 20.1, 0.7, 13.1, tm, 0, 7.4, 0);
  g.userData.teamMat = tm; g.userData.stack = new THREE.Vector3(7.5, 15, -4); return g;
}
function mAAGun(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const sand = mat(0xa89a72), dark = mat(0x2d3033);
  const ring = part(g, new THREE.CylinderGeometry(4.6, 5, 1.6, 10, 1, true), sand, 0, 0.8, 0);
  ring.material = new THREE.MeshLambertMaterial({ color: 0xa89a72, side: THREE.DoubleSide });
  const t = new THREE.Group(); t.position.set(0, 0.2, 0);
  cyl(t, 1.2, 1.5, 1.4, dark, 0, 0.7, 0, 'y');
  bx(t, 1.6, 1.2, 1.8, dark, 0, 1.9, 0);
  for (const x of [-0.45, 0.45]) { const b = cyl(t, 0.12, 0.14, 5, dark, x, 3.2, 2.2); b.rotation.x = -0.6; }
  bx(t, 1.7, 0.2, 1.0, tm, 0, 2.6, -0.5);
  g.add(t); g.userData.turrets = [t];
  bx(g, 0.2, 3, 0.2, dark, 4, 1.5, -4); bx(g, 0.1, 1.2, 2, tm, 4, 2.6, -5);
  g.userData.teamMat = tm; return g;
}
function mHQ(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const wall = mat(team === ALLY ? 0xb8b39a : 0x86837c), roof = mat(0x4c4f48);
  bx(g, 24, 9, 16, wall, 0, 4.5, 0);
  bx(g, 25, 1, 17, roof, 0, 9.5, 0);
  bx(g, 7, 16, 7, wall, 0, 8, -2);
  bx(g, 8, 1, 8, roof, 0, 16.5, -2);
  for (let i = 0; i < 5; i++) { bx(g, 2, 2.2, 0.3, GLASS, -9 + i * 4.5, 6, 8.05); bx(g, 2, 2.2, 0.3, GLASS, -9 + i * 4.5, 2.5, 8.05); }
  cyl(g, 0.2, 0.2, 12, mat(0x2d3033), 0, 23, -2, 'y');
  bx(g, 0.2, 4, 7, tm, 0, 26.5, -5.6);
  bx(g, 24.1, 1, 16.1, tm, 0, 8.3, 0);
  g.userData.teamMat = tm; return g;
}
function mDock(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const wood = mat(0x6e5a40), dark = mat(0x2d3033);
  bx(g, 14, 1.2, 70, wood, 0, 4.4, 30);
  for (let i = 0; i < 7; i++) { bx(g, 1, 12, 1, wood, 6, -1, i * 11 - 2); bx(g, 1, 12, 1, wood, -6, -1, i * 11 - 2); }
  bx(g, 12, 6, 10, mat(0x7f7466), 0, 6, -8);
  bx(g, 12.1, 0.6, 10.1, tm, 0, 8.8, -8);
  bx(g, 1.2, 14, 1.2, dark, 4, 12, 45);
  const arm = bx(g, 1, 1, 16, dark, 4, 18.5, 50); arm.rotation.x = -0.25;
  for (let i = 0; i < 4; i++) bx(g, 3, 3, 3, mat([0x8a5a2b, 0x5c7a3a, 0x7a3a2e, 0x8a7a4a][i]), -3 + (i % 2) * 3.2, 6.5, 14 + Math.floor(i / 2) * 3.4);
  g.userData.teamMat = tm; return g;
}
function mHeli(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = mat(team === ALLY ? 0x5d6b45 : 0x66707a), dark = mat(0x2a2a2a);
  const c = part(g, new THREE.SphereGeometry(1.4, 8, 6), GLASS, 0, 0, 1.6); c.scale.set(1, 1, 1.3);
  bx(g, 2.2, 2.2, 3, body, 0, 0, -0.6);
  cyl(g, 0.6, 0.2, 7, body, 0, 0.4, -5.4);
  bx(g, 0.15, 1.8, 1.1, tm, 0, 1.1, -8.6);
  cyl(g, 1.1, 1.1, 0.05, PROP, 0.25, 0.9, -8.6, 'x');
  cyl(g, 0.2, 0.2, 1.3, dark, 0, 1.6, -0.4, 'y');
  cyl(g, 6, 6, 0.06, PROP, 0, 2.3, -0.4, 'y');
  const rotor = new THREE.Group(); rotor.position.set(0, 2.25, -0.4);
  bx(rotor, 12, 0.08, 0.5, dark, 0, 0, 0); bx(rotor, 0.5, 0.08, 12, dark, 0, 0, 0);
  g.add(rotor); g.userData.rotor = rotor;
  for (const x of [-1.2, 1.2]) {
    bx(g, 0.15, 0.15, 4.6, dark, x, -1.9, 0); bx(g, 0.1, 0.9, 0.1, dark, x, -1.5, 1); bx(g, 0.1, 0.9, 0.1, dark, x, -1.5, -1);
    cyl(g, 0.16, 0.16, 1.8, dark, x * 1.25, -0.8, 0.8);
  }
  bx(g, 2.25, 0.5, 3.02, tm, 0, 0.6, -0.6);
  g.userData.teamMat = tm; return g;
}
function mTruck(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = mat(team === ALLY ? 0x56633a : 0x7b745c), dark = mat(0x26261f), canvas = mat(team === ALLY ? 0x8a8a62 : 0x8f8a78);
  bx(g, 2.5, 0.6, 6.8, dark, 0, 0.95, 0);
  bx(g, 2.5, 1.7, 1.7, body, 0, 2.1, 1.7);
  bx(g, 2.2, 1.0, 1.4, body, 0, 1.75, 3.1);
  bx(g, 2.3, 0.7, 0.1, GLASS, 0, 2.5, 2.57);
  bx(g, 2.7, 2.0, 4.0, canvas, 0, 2.3, -1.4);
  bx(g, 2.74, 0.45, 4.02, tm, 0, 3.0, -1.4);
  for (const z of [2.6, -1.2, -2.6]) for (const x of [-1.3, 1.3]) cyl(g, 0.6, 0.6, 0.5, dark, x, 0.6, z, 'x');
  g.userData.teamMat = tm; return g;
}
function mJeep(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = mat(team === ALLY ? 0x56633a : 0x7b745c), dark = mat(0x26261f);
  bx(g, 2.0, 0.8, 4.2, body, 0, 1.0, 0);
  bx(g, 1.8, 0.5, 1.4, body, 0, 1.55, 1.3);
  bx(g, 1.8, 0.7, 0.08, GLASS, 0, 2.1, 0.55);
  bx(g, 1.7, 0.12, 1.0, tm, 0, 1.83, 1.3);
  for (const z of [1.4, -1.4]) for (const x of [-1.05, 1.05]) cyl(g, 0.5, 0.5, 0.4, dark, x, 0.5, z, 'x');
  const d1 = figure(team === ALLY ? 0x5a6a3c : 0x6a6d60); d1.position.set(0.5, 1.9, -0.1); d1.userData.person = true; g.add(d1);
  const t = new THREE.Group(); t.position.set(0, 1.4, -1.2);
  cyl(t, 0.08, 0.08, 1.4, dark, 0, 0.7, 0, 'y'); bx(t, 0.25, 0.25, 0.7, dark, 0, 1.45, 0.1); cyl(t, 0.05, 0.05, 1.6, dark, 0, 1.45, 1.1);
  const gn = figure(team === ALLY ? 0x5a6a3c : 0x6a6d60); gn.position.set(0, 0.8, -0.6); gn.userData.person = true; t.add(gn);
  g.add(t); g.userData.turrets = [t];
  g.userData.teamMat = tm; return g;
}
function mSub(team, d) {
  const g = new THREE.Group(), tm = teamMat(team), len = d.len, r = d.beam / 2;
  const hull = mat(team === ALLY ? 0x4a545c : 0x3a4046), dark = mat(0x23272b);
  cyl(g, r, r, len * 0.6, hull, 0, -r * 0.3, 0);
  cyl(g, r * 0.25, r, len * 0.2, hull, 0, -r * 0.3, len * 0.4);
  cyl(g, r, r * 0.2, len * 0.2, hull, 0, -r * 0.3, -len * 0.4);
  bx(g, r * 1.1, 0.4, len * 0.8, dark, 0, r * 0.7, 0);
  bx(g, r * 0.8, r * 1.3, len * 0.14, hull, 0, r * 1.5, len * 0.03);
  bx(g, r * 0.82, 0.5, len * 0.141, tm, 0, r * 1.9, len * 0.03);
  cyl(g, 0.15, 0.15, r * 1.0, dark, 0, r * 2.4, len * 0.05, 'y');
  bx(g, 0.15, 2, 2.6, tm, 0, r * 0.7 + 1.6, -len * 0.4);
  const t = new THREE.Group(); t.position.set(0, r * 0.75, len * 0.18);
  bx(t, 1, 0.9, 1.2, dark, 0, 0.45, 0); cyl(t, 0.14, 0.14, 3, dark, 0, 0.7, 1.8);
  g.add(t); g.userData.turrets = [t]; g.userData.teamMat = tm; return g;
}
function mAirport(team) {
  // origin = control tower; the runway lies 45 units south (+z) and runs east-west
  const g = new THREE.Group(), tm = teamMat(team);
  const tarmac = mat(0x3c3f42), line = mat(0xd8d8d0), conc = mat(0x8c8c84), shed = mat(team === ALLY ? 0x6f7468 : 0x66696c), dark = mat(0x2d3033);
  bx(g, 380, 0.3, 30, tarmac, 0, 0.12, 45);
  for (let i = -8; i <= 8; i++) bx(g, 12, 0.32, 1, line, i * 21, 0.13, 45);
  bx(g, 3, 0.32, 24, line, -184, 0.13, 45); bx(g, 3, 0.32, 24, line, 184, 0.13, 45);
  bx(g, 150, 0.24, 32, conc, 0, 0.1, 16);
  bx(g, 7, 14, 7, conc, 0, 7, 0); bx(g, 9.5, 3, 9.5, GLASS, 0, 15.5, 0); bx(g, 10.5, 0.7, 10.5, tm, 0, 17.3, 0);
  cyl(g, 0.15, 0.15, 5, dark, 0, 20, 0, 'y');
  for (const x of [-42, 42]) {
    bx(g, 26, 9, 22, shed, x, 4.5, -6);
    const r = cyl(g, 13, 13, 22, shed, x, 9, -6); r.scale.y = 0.35;
    bx(g, 19, 7, 0.4, dark, x, 3.5, 5.1);
    bx(g, 26.1, 0.8, 22.1, tm, x, 8.6, -6);
  }
  cyl(g, 9, 9, 0.3, tarmac, 62, 0.14, 16, 'y');
  bx(g, 8, 0.34, 1.2, line, 62, 0.16, 16); bx(g, 1.2, 0.34, 8, line, 59, 0.16, 16); bx(g, 1.2, 0.34, 8, line, 65, 0.16, 16);
  bx(g, 0.25, 6, 0.25, dark, -80, 3, 26); bx(g, 0.2, 1, 3, tm, -80, 5.6, 27.5);
  g.userData.teamMat = tm; return g;
}
function buildModel(d, team) {
  switch (d.model) {
    case 'fighter': return mFighter(team, d);
    case 'bomber': return mBomber(team, d);
    case 'heli': return mHeli(team);
    case 'truck': return mTruck(team);
    case 'jeep': return mJeep(team);
    case 'sub': return mSub(team, d);
    case 'airport': return mAirport(team);
    case 'b52': return mB52(team);
    case 'tank': return mTank(team, d);
    case 'halftrack': return mHalftrack(team);
    case 'squad': return mSquad(team);
    case 'ship': return mShip(team, d);
    case 'merchant': return mMerchant(team, d);
    case 'house': return mHouse(team);
    case 'factory': return mFactory(team);
    case 'aagun': return mAAGun(team);
    case 'hq': return mHQ(team);
    case 'dock': return mDock(team);
  }
  return new THREE.Group();
}
function mIceberg(r) {
  const geo = new THREE.IcosahedronGeometry(r, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const hsh = Math.sin(p.getX(i) * 12.9 + p.getY(i) * 78.2 + p.getZ(i) * 37.7 + r) * 43758.5;
    const k = 0.75 + (hsh - Math.floor(hsh)) * 0.5;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * (p.getY(i) > 0 ? 1.3 : 0.5), p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xe8f6ff, emissive: 0x24404f }));
}

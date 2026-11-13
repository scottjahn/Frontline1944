'use strict';
// ---------- procedural low-poly models (nose / bow points +Z) ----------
const MatCache = {};
function mat(c) { return MatCache[c] || (MatCache[c] = new THREE.MeshLambertMaterial({ color: c })); }
function part(g, geo, m, x, y, z) { const me = new THREE.Mesh(geo, m); me.position.set(x || 0, y || 0, z || 0); g.add(me); return me; }

// ---------- procedural textures: painted on small canvases at start-up, no image files needed ----------
const TexCache = {};
const css = c => '#' + ('00000' + c.toString(16)).slice(-6);
function rng32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function tex(key, w, h, draw) {
  if (TexCache[key]) return TexCache[key];
  let seed = 7; for (let i = 0; i < key.length; i++) seed = seed * 31 + key.charCodeAt(i) | 0;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h, rng32(seed));
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return TexCache[key] = t;
}
// irregular paint blotch that wraps around the tile edges, so the texture repeats without seams
function blob(c, S, x, y, r, R) {
  for (let k = 0; k < 6; k++) {
    const a = R() * 6.283, d = R() * r * 0.7, rr = r * (0.45 + R() * 0.45), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { c.beginPath(); c.arc(px + ox, py + oy, rr, 0, 6.283); c.fill(); }
  }
}
function shard(c, S, x, y, r, R) {
  const n = 3 + Math.floor(R() * 3), a0 = R() * 6.283, pts = [];
  for (let k = 0; k < n; k++) { const a = a0 + k / n * 6.283 + R() * 0.5, rr = r * (0.55 + R() * 0.7); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { c.beginPath(); pts.forEach((q, i) => c[i ? 'lineTo' : 'moveTo'](x + ox + q[0], y + oy + q[1])); c.closePath(); c.fill(); }
}
function grit(c, S, R, n, a) {
  for (let i = 0; i < n; i++) { c.fillStyle = R() < 0.55 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.7})`; c.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
}
function panelLines(c, S, step, a) {
  c.fillStyle = `rgba(0,0,0,${a})`;
  for (let v = 0; v < S; v += step) { c.fillRect(v, 0, 1, S); c.fillRect(0, v, S, 1); }
  c.fillStyle = `rgba(255,255,255,${a * 0.35})`;
  for (let v = 0; v < S; v += step) { c.fillRect(v + 1, 0, 1, S); c.fillRect(0, v + 1, S, 1); }
  c.fillStyle = `rgba(0,0,0,${a * 0.9})`;                         // rivets
  for (let v = 0; v < S; v += step) for (let k = 4; k < S; k += 8) { c.fillRect(v + 4, k, 1, 1); c.fillRect(k, v + 4, 1, 1); }
}
// a textured material. kind: camo | splinter | metal | hull | planks | tread | canvas. tile = world units per repeat.
function skin(kind, a, b, c2, tile) {
  const key = kind + '_' + a + '_' + b + '_' + c2 + '_' + tile; if (MatCache[key]) return MatCache[key];
  const S = 256;
  const t = tex(key, S, S, (c, w, h, R) => {
    c.fillStyle = css(a); c.fillRect(0, 0, S, S);
    if (kind === 'camo') {
      c.fillStyle = css(b); for (let i = 0; i < 9; i++) blob(c, S, R() * S, R() * S, 26 + R() * 22, R);
      c.fillStyle = css(c2); for (let i = 0; i < 7; i++) blob(c, S, R() * S, R() * S, 15 + R() * 18, R);
      grit(c, S, R, 1500, 0.07); panelLines(c, S, 64, 0.2);
    } else if (kind === 'splinter') {
      c.fillStyle = css(b); for (let i = 0; i < 7; i++) shard(c, S, R() * S, R() * S, 40 + R() * 30, R);
      c.fillStyle = css(c2); for (let i = 0; i < 5; i++) shard(c, S, R() * S, R() * S, 28 + R() * 22, R);
      grit(c, S, R, 1200, 0.06); panelLines(c, S, 64, 0.24);
    } else if (kind === 'metal') {
      for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 64) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + R() * 0.06})`; c.fillRect(x, y, 64, 64); }
      for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(255,255,255,${R() * 0.07})`; c.fillRect(0, R() * S, S, 1); }
      grit(c, S, R, 500, 0.05); panelLines(c, S, 64, 0.34);
    } else if (kind === 'hull') {
      for (let y = 0; y < S; y += 32) for (let x = 0; x < S; x += 64) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + R() * 0.05})`; c.fillRect(x + (y / 32 % 2) * 32, y, 64, 32); }
      c.fillStyle = 'rgba(0,0,0,.22)';
      for (let y = 0; y < S; y += 32) { c.fillRect(0, y, S, 1); for (let x = (y / 32 % 2) * 32; x < S; x += 64) c.fillRect(x, y, 1, 32); }
      for (let i = 0; i < 26; i++) {                               // rust and salt streaks running down the plates
        const x = R() * S, y = R() * S, l = 20 + R() * 60, g = c.createLinearGradient(0, y, 0, y + l);
        const col = R() < 0.7 ? css(b) : '#e8ecf0';
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.16 + R() * 0.2; c.fillStyle = g;
        for (const oy of [-S, 0]) c.fillRect(x, y + oy, 1 + R() * 3, l);
      }
      c.globalAlpha = 1; grit(c, S, R, 900, 0.06);
    } else if (kind === 'planks') {
      for (let x = 0; x < S; x += 8) {
        c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,240,200'},${0.03 + R() * 0.1})`; c.fillRect(x, 0, 8, S);
        c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x, 0, 1, S);
        for (let k = 0; k < 3; k++) c.fillRect(x, R() * S, 8, 1);
      }
      grit(c, S, R, 700, 0.05);
    } else if (kind === 'tread') {
      for (let y = 0; y < S; y += 16) { c.fillStyle = css(b); c.fillRect(0, y, S, 7); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, y, S, 1); }
      c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(S * 0.46, 0, S * 0.08, S); grit(c, S, R, 900, 0.1);
    } else if (kind === 'canvas') {
      c.fillStyle = 'rgba(0,0,0,.06)'; for (let v = 0; v < S; v += 3) { c.fillRect(v, 0, 1, S); c.fillRect(0, v, S, 1); }
      for (let x = 0; x < S; x += 64) { const g = c.createLinearGradient(x, 0, x + 64, 0); g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(0.25, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(0,0,0,.2)'); c.fillStyle = g; c.fillRect(x, 0, 64, S); }
      c.fillStyle = 'rgba(40,30,15,.12)'; for (let i = 0; i < 12; i++) blob(c, S, R() * S, R() * S, 10 + R() * 14, R);
    }
  });
  const m = new THREE.MeshLambertMaterial({ map: t }); m.userData.tile = tile;
  return MatCache[key] = m;
}
function airSkin(team, tile) { return team === ALLY ? skin('camo', 0x5d6b45, 0x48563a, 0x717d54, tile || 8) : skin('splinter', 0x69737c, 0x47584e, 0x868f96, tile || 8); }
function landSkin(team) { return team === ALLY ? skin('camo', 0x56633a, 0x404c2a, 0x6c794c, 6) : skin('camo', 0x9a8a5c, 0x5b6438, 0x6e4c33, 6); }
function trackSkin() { return skin('tread', 0x1c1c18, 0x35352d, 0, 3); }
function shipSkin(team) { return skin('hull', team === ALLY ? 0x76828e : 0x4d555e, 0x6b4a36, 0, 16); }
function supSkin(team) { return skin('hull', team === ALLY ? 0x94a0ab : 0x626b74, 0x5a5048, 1, 12); }
function deckSkin() { return skin('planks', 0x9c8a66, 0, 0, 6); }
// national markings: white star for the Allies, straight-armed cross for the Axis
const DecalMat = [];
function decal(g, team, size, x, y, z, face) {
  if (!DecalMat[team]) {
    const t = tex('insignia' + team, 64, 64, c => {
      if (team === ALLY) {
        c.fillStyle = '#f2f2f2'; c.fillRect(2, 25, 60, 14); c.fillStyle = '#1c3566'; c.fillRect(4, 27, 56, 10); c.fillStyle = '#f2f2f2'; c.fillRect(6, 29, 52, 6);
        c.fillStyle = '#1c3566'; c.beginPath(); c.arc(32, 32, 21, 0, 6.283); c.fill();
        c.fillStyle = '#f2f2f2'; c.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7.6 : 20; c[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
        c.closePath(); c.fill();
      } else {
        c.fillStyle = '#f2f2f2'; c.fillRect(21, 4, 22, 56); c.fillRect(4, 21, 56, 22);
        c.fillStyle = '#111'; c.fillRect(26, 6, 12, 52); c.fillRect(6, 26, 52, 12);
      }
    });
    DecalMat[team] = new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), DecalMat[team]); m.position.set(x, y, z);
  if (face === 'up') m.rotation.x = -Math.PI / 2; else if (face === 'right') m.rotation.y = Math.PI / 2; else if (face === 'left') m.rotation.y = -Math.PI / 2;
  m.userData.decal = true; g.add(m); return m;
}
function tileOf(m) { return m && m.userData && m.userData.tile; }
function bx(g, w, h, d, m, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d), T = tileOf(m);
  if (T) {                             // keep the paint the same scale on every panel, whatever its size
    const uv = geo.attributes.uv, off = (w * 7.3 + d * 3.1 + h) % 1;
    for (let i = 0; i < 24; i++) { const f = i >> 2; uv.setXY(i, uv.getX(i) * (f < 2 ? d : w) / T + off, uv.getY(i) * (f < 2 || f > 3 ? h : d) / T + off); }
  }
  return part(g, geo, m, x, y, z);
}
// cylinder: rFront = radius at +axis end
function cyl(g, rFront, rBack, len, m, x, y, z, axis) {
  const geo = new THREE.CylinderGeometry(rFront, rBack, len, 10), T = tileOf(m);
  if (T) {
    const uv = geo.attributes.uv, ku = Math.max(1, Math.round(6.283 * Math.max(rFront, rBack) / T)), kv = len / T;
    for (let i = 0; i < 22; i++) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv);
  }
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
  const body = airSkin(team), dark = mat(0x2a2a2a);
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
  for (const x of [-3.3, 3.3]) decal(g, team, 1.7, x, -0.14, 0.4, 'up');
  decal(g, team, 1.1, 0.72, 0.05, -3.4, 'right'); decal(g, team, 1.1, -0.72, 0.05, -3.4, 'left');
  if (d.big) g.scale.setScalar(d.big);
  g.userData.teamMat = tm; return g;
}
function mBomber(team, d) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = d.silver ? skin('metal', 0xc2c7cc, 0, 0, 12) : d.cargoLook ? (team === ALLY ? skin('camo', 0x7d8468, 0x6c7458, 0x8a9174, 13) : skin('splinter', 0x8a8f94, 0x767c82, 0x999ea3, 13)) : airSkin(team, 13), dark = mat(0x2a2a2a);
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
  for (const x of [-10.5, 10.5]) decal(g, team, 3.4, x, 0.2, 1.5, 'up');
  decal(g, team, 2.1, 1.47, 0, -5, 'right'); decal(g, team, 2.1, -1.47, 0, -5, 'left');
  if (d.big) g.scale.setScalar(d.big);
  g.userData.teamMat = tm; return g;
}
function mB52(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = team === ALLY ? skin('metal', 0xb9bec4, 0, 0, 16) : skin('splinter', 0x6f787f, 0x4d5c54, 0x8a9298, 16), dark = mat(0x3a3d42), belly = mat(0x8d9299);
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
  decal(g, team, 3, 2.16, 0, 9, 'right'); decal(g, team, 3, -2.16, 0, 9, 'left');
  g.userData.teamMat = tm; return g;
}
function mTank(team, d) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = landSkin(team), dark = mat(0x26261f), tr = trackSkin();
  bx(g, 3.2, 1.1, 6, body, 0, 1.0, 0);
  bx(g, 0.85, 1.0, 6.5, tr, 1.7, 0.5, 0); bx(g, 0.85, 1.0, 6.5, tr, -1.7, 0.5, 0);
  for (const x of [-1.72, 1.72]) for (let i = 0; i < 5; i++) cyl(g, 0.42, 0.42, 0.9, dark, x, 0.45, -2.6 + i * 1.3, 'x');
  decal(g, team, 0.9, 1.61, 1.05, -1.2, 'right'); decal(g, team, 0.9, -1.61, 1.05, -1.2, 'left');
  bx(g, 2.6, 0.3, 1.6, body, 0, 1.6, -2);
  const t = new THREE.Group(); t.position.set(0, 1.55, 0.2);
  bx(t, 2.3, 0.95, 2.7, body, 0, 0.47, 0);
  cyl(t, 0.17, 0.17, 4.2, dark, 0, 0.5, 3.2);
  bx(t, 0.9, 0.16, 0.9, tm, 0, 1.0, -0.5);
  cyl(t, 0.3, 0.3, 0.5, dark, 0, 0.5, 1.35); cyl(t, 0.35, 0.35, 0.25, dark, 0.55, 1.0, 0.4, 'y');
  g.add(t); g.userData.turrets = [t];
  if (d.big) g.scale.setScalar(d.big);
  g.userData.teamMat = tm; return g;
}
function mHalftrack(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = landSkin(team), dark = mat(0x26261f), tr = trackSkin();
  bx(g, 3, 1.2, 6.4, body, 0, 1.1, 0);
  bx(g, 2.8, 1.1, 1.8, body, 0, 2.1, 1.6);
  bx(g, 0.8, 0.9, 3.2, tr, 1.6, 0.45, -1.4); bx(g, 0.8, 0.9, 3.2, tr, -1.6, 0.45, -1.4);
  decal(g, team, 0.9, 1.51, 1.2, 0.2, 'right'); decal(g, team, 0.9, -1.51, 1.2, 0.2, 'left');
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
  // extrusion UVs are in world units: scale them to the deck (caps) and hull (sides) texture tiles
  const uv = geo.attributes.uv;
  for (const gr of geo.groups) { const T = gr.materialIndex ? 16 : 6; for (let i = gr.start; i < gr.start + gr.count; i++) uv.setXY(i, uv.getX(i) / T, uv.getY(i) / T); }
  geo.rotateX(-Math.PI / 2); return geo;
}
function mShip(team, d) {
  const g = new THREE.Group(), tm = teamMat(team);
  const len = d.len, beam = d.beam, h = beam * 0.6, deck = h * 0.55;
  const hullM = shipSkin(team), sup = supSkin(team), dark = mat(0x2b2f33);
  part(g, hullGeo(len, beam, h), [deckSkin(), hullM], 0, -h * 0.45, 0);
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
  const hullM = d.mil ? shipSkin(team) : skin('hull', team === ALLY ? 0x4a4f55 : 0x3b3530, 0x8a4a28, 2, 16), sup = mat(d.mil ? 0x94a0ab : 0xd8d2c0), dark = mat(0x2b2f33);
  part(g, hullGeo(len, beam, h), [d.mil ? mat(0x5d666e) : deckSkin(), hullM], 0, -h * 0.45, 0);
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
  const body = airSkin(team, 6), dark = mat(0x2a2a2a);
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
  decal(g, team, 1.1, 1.12, -0.35, -0.6, 'right'); decal(g, team, 1.1, -1.12, -0.35, -0.6, 'left');
  g.userData.teamMat = tm; return g;
}
function mTruck(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = landSkin(team), dark = mat(0x26261f), canvas = skin('canvas', team === ALLY ? 0x8a8a62 : 0x8f8a78, 0, 0, 4);
  bx(g, 2.5, 0.6, 6.8, dark, 0, 0.95, 0);
  bx(g, 2.5, 1.7, 1.7, body, 0, 2.1, 1.7);
  bx(g, 2.2, 1.0, 1.4, body, 0, 1.75, 3.1);
  bx(g, 2.3, 0.7, 0.1, GLASS, 0, 2.5, 2.57);
  bx(g, 2.7, 2.0, 4.0, canvas, 0, 2.3, -1.4);
  bx(g, 2.74, 0.45, 4.02, tm, 0, 3.0, -1.4);
  decal(g, team, 0.8, 1.26, 2.0, 1.7, 'right'); decal(g, team, 0.8, -1.26, 2.0, 1.7, 'left');
  for (const z of [2.6, -1.2, -2.6]) for (const x of [-1.3, 1.3]) cyl(g, 0.6, 0.6, 0.5, dark, x, 0.6, z, 'x');
  g.userData.teamMat = tm; return g;
}
function mJeep(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const body = landSkin(team), dark = mat(0x26261f);
  bx(g, 2.0, 0.8, 4.2, body, 0, 1.0, 0);
  decal(g, team, 0.9, 0, 1.81, 1.3, 'up');
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
  const hull = skin('hull', team === ALLY ? 0x4a545c : 0x3a4046, 0x4a3a2c, 3, 12), dark = mat(0x23272b);
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
function flightDeck(team) {
  const key = 'flightdeck' + team; if (MatCache[key]) return MatCache[key];
  const t = tex(key, 128, 512, (c, w, h, R) => {
    c.fillStyle = team === ALLY ? '#39434e' : '#4b4438'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,.16)'; for (let y = 0; y < h; y += 6) c.fillRect(0, y, w, 1);
    for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(0,0,0,${0.04 + R() * 0.08})`; c.fillRect(20 + R() * 88, R() * h, 2 + R() * 5, 20 + R() * 60); }   // tyre marks
    c.fillStyle = 'rgba(240,240,235,.85)';
    for (let y = 14; y < h - 20; y += 40) c.fillRect(62, y, 4, 24);
    c.fillRect(8, 6, 2, h - 12); c.fillRect(118, 6, 2, h - 12);
    for (let x = 22; x < 108; x += 12) { c.fillRect(x, 8, 6, 22); c.fillRect(x, h - 30, 6, 22); }
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 2; c.strokeRect(42, 120, 44, 50); c.strokeRect(42, 330, 44, 50);
    c.strokeStyle = 'rgba(240,210,60,.8)'; c.strokeRect(45, 123, 38, 44); c.strokeRect(45, 333, 38, 44);
  });
  return MatCache[key] = new THREE.MeshLambertMaterial({ map: t });
}
function mCarrier(team, d) {
  const g = new THREE.Group(), tm = teamMat(team);
  const len = d.len, beam = d.beam, deckY = 6.6, ix = beam * 0.5, iz = len * 0.06;
  const hullM = shipSkin(team), sup = supSkin(team), dark = mat(0x2b2f33), edge = mat(team === ALLY ? 0x4a535d : 0x3c3f42);
  part(g, hullGeo(len, beam * 0.86, 9), [edge, hullM], 0, -3.6, 0);
  bx(g, beam * 0.84, 1.3, len * 0.86, sup, 0, 5.5, 0);                // hangar deck under the overhang
  const fd = new THREE.Mesh(new THREE.BoxGeometry(beam * 1.22, 0.7, len * 0.98), [edge, edge, flightDeck(team), edge, edge, edge]);
  fd.position.set(0, deckY - 0.35, 0); g.add(fd);
  bx(g, 3.4, 6, 24, sup, ix, deckY + 3, iz);                          // island
  bx(g, 3.0, 3, 12, sup, ix, deckY + 7.5, iz + 2);
  bx(g, 3.1, 0.9, 12.1, GLASS, ix, deckY + 8.2, iz + 2);
  bx(g, 3.45, 0.7, 24.1, tm, ix, deckY + 5.6, iz);
  cyl(g, 1.3, 1.6, 6, dark, ix, deckY + 9, iz - 7, 'y');
  cyl(g, 0.2, 0.25, 12, dark, ix, deckY + 15, iz + 4, 'y');
  bx(g, 5, 0.2, 0.2, dark, ix, deckY + 19, iz + 4); bx(g, 3.4, 1.7, 0.2, dark, ix, deckY + 21.4, iz + 4);
  const turrets = [];
  for (const z of [iz + 17, iz - 17]) {
    const t = new THREE.Group(); t.position.set(ix, deckY, z);
    bx(t, 2.6, 1.6, 3, sup, 0, 0.8, 0);
    cyl(t, 0.14, 0.14, 3.6, dark, 0.5, 1.1, 2.6); cyl(t, 0.14, 0.14, 3.6, dark, -0.5, 1.1, 2.6);
    g.add(t); turrets.push(t);
  }
  for (let i = 0; i < 5; i++) { bx(g, 1.8, 1.2, 2.6, dark, -beam * 0.63, deckY - 0.5, -len * 0.36 + i * len * 0.18); cyl(g, 0.08, 0.08, 2.4, dark, -beam * 0.63, deckY + 0.9, -len * 0.36 + i * len * 0.18 + 0.8); }
  for (let i = 0; i < 3; i++) {                                       // aircraft spotted aft
    const p = mFighter(team, {}); p.scale.setScalar(0.8); p.position.set(-3.5 + (i % 2) * 6.5, deckY + 1.1, -len * 0.26 - i * 8); p.rotation.y = i % 2 ? -0.3 : 0.3;
    p.traverse(o => { if (o.material === PROP) o.visible = false; }); g.add(p);
  }
  for (let i = 0; i < 7; i++) {
    const f = figure([0xd8c23a, 0x3a6ab0, 0xb03a3a, 0x3a8a4a][i % 4]); f.position.set((Math.random() - 0.5) * beam * 0.9, deckY + 0.75, (Math.random() - 0.3) * len * 0.6);
    f.userData.person = true; g.add(f);
  }
  cyl(g, 0.12, 0.12, 6, dark, 0, deckY + 3, -len * 0.48, 'y');
  bx(g, 0.15, 2.4, 3.8, tm, 0, deckY + 4.8, -len * 0.48 - 2);
  g.userData.turrets = turrets; g.userData.teamMat = tm; return g;
}
// field command post that holds a capture point
function mOutpost(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const conc = skin('hull', 0x8d8a7c, 0x5a5248, 4, 9), sand = mat(0xa89a72), dark = mat(0x2d3033), tent = skin('canvas', team === ALLY ? 0x6f7450 : 0x7d7862, 0, 0, 5);
  const ring = part(g, new THREE.CylinderGeometry(13, 13.8, 2, 14, 1, true), new THREE.MeshLambertMaterial({ color: 0xa89a72, side: THREE.DoubleSide }), 0, 1, 0);
  ring.userData.keep = 1;
  bx(g, 11, 4.6, 8, conc, 0, 2.3, -1);
  bx(g, 11.6, 0.7, 8.6, conc, 0, 4.9, -1);
  bx(g, 6, 0.7, 0.3, dark, 0, 3.2, 3.05);
  bx(g, 11.1, 0.6, 8.1, tm, 0, 4.2, -1);
  for (const x of [-9, 9]) { const t = part(g, new THREE.ConeGeometry(3.4, 3.6, 4), tent, x, 1.8, 5); t.rotation.y = Math.PI / 4; }
  for (let i = 0; i < 5; i++) bx(g, 1.6, 1.3, 1.6, mat([0x6b5a3a, 0x4d5a34, 0x7a6a45][i % 3]), -8 + (i % 3) * 1.7, 0.65 + Math.floor(i / 3) * 1.3, -7);
  const t = new THREE.Group(); t.position.set(0, 5.2, -1);
  cyl(t, 1.1, 1.4, 1.2, dark, 0, 0.6, 0, 'y'); bx(t, 1.5, 1.1, 1.7, dark, 0, 1.7, 0);
  for (const x of [-0.4, 0.4]) { const b = cyl(t, 0.11, 0.13, 4.6, dark, x, 2.9, 2); b.rotation.x = -0.6; }
  g.add(t); g.userData.turrets = [t];
  cyl(g, 0.16, 0.2, 22, dark, 7.5, 11, -6, 'y'); bx(g, 3, 0.15, 0.15, dark, 7.5, 20, -6); bx(g, 2, 0.15, 0.15, dark, 7.5, 17.5, -6);   // radio mast
  cyl(g, 0.18, 0.22, 26, mat(0xd8d8d0), -7.5, 13, -5, 'y');
  bx(g, 0.2, 4.6, 8, tm, -7.5, 23.5, -9.1);                           // the flag
  g.userData.teamMat = tm; return g;
}
// armed platform on stilts that holds a capture point at sea
function mSeaFort(team) {
  const g = new THREE.Group(), tm = teamMat(team);
  const steel = skin('hull', 0x7a7f84, 0x7a4a2e, 5, 10), dark = mat(0x2d3033);
  for (const x of [-6, 6]) for (const z of [-6, 6]) { const l = cyl(g, 1.1, 1.5, 38, steel, x, -10, z, 'y'); l.userData.keep = 1; }
  bx(g, 17, 2.4, 17, steel, 0, 10, 0);
  bx(g, 17.2, 0.6, 17.2, tm, 0, 11.4, 0);
  bx(g, 9, 5, 9, steel, -2, 13.7, -2);
  bx(g, 9.1, 0.9, 9.1, GLASS, -2, 14.6, -2);
  bx(g, 10, 0.6, 10, dark, -2, 16.5, -2);
  const t = new THREE.Group(); t.position.set(5, 11.2, 5);
  cyl(t, 1.2, 1.5, 1.4, dark, 0, 0.7, 0, 'y'); bx(t, 1.6, 1.2, 1.8, dark, 0, 1.9, 0);
  for (const x of [-0.45, 0.45]) { const b = cyl(t, 0.12, 0.14, 5, dark, x, 3.2, 2.2); b.rotation.x = -0.6; }
  g.add(t); g.userData.turrets = [t];
  cyl(g, 0.18, 0.22, 16, mat(0xd8d8d0), -2, 24.5, -2, 'y');
  bx(g, 0.2, 4.2, 7, tm, -2, 30, -5.6);
  bx(g, 3, 1, 12, steel, 9.5, 6, 0); bx(g, 0.4, 9, 0.4, dark, 10.5, 2, 5);   // boat landing
  g.userData.teamMat = tm; return g;
}
function buildModel(d, team) {
  switch (d.model) {
    case 'carrier': return mCarrier(team, d);
    case 'outpost': return mOutpost(team);
    case 'seafort': return mSeaFort(team);
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

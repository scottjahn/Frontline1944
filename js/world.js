'use strict';
// ---------- terrain (north-west Europe), route-finding, water, seasons, weather, icebergs ----------
// The outlines in EU_LAND are painted onto a small canvas and turned into a signed distance field:
// how far each spot is from the coast (+ inland, - out to sea). The terrain, the AI's route-finding and
// all "is this land or water" questions read from it.
const SDF = { w: 1400, h: 750, cell: 10, d: null };
(function buildSDF() {
  const w = SDF.w, h = SDF.h, cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
  c.fillStyle = '#fff';
  for (const poly of EU_LAND) {
    c.beginPath(); poly.forEach((q, i) => { const p = LL(q[0], q[1]); c[i ? 'lineTo' : 'moveTo']((p.x + MAP.x) / SDF.cell, (p.z + MAP.z) / SDF.cell); }); c.closePath(); c.fill();
  }
  const img = c.getImageData(0, 0, w, h).data, n = w * h, BIG = 1e6;
  const dl = new Float32Array(n), dw = new Float32Array(n);      // distance to the nearest land / nearest water
  for (let i = 0; i < n; i++) { const land = img[i * 4 + 3] > 127; dl[i] = land ? 0 : BIG; dw[i] = land ? BIG : 0; }
  for (const d of [dl, dw]) {                                    // two-pass chamfer distance transform
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + 1.414); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1.414); }
      d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1.414); if (x > 0) v = Math.min(v, d[i + w - 1] + 1.414); }
      d[i] = v;
    }
  }
  let sd = new Float32Array(n), tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) sd[i] = (dw[i] - dl[i]) * SDF.cell;
  for (let pass = 0; pass < 2; pass++) {                         // soften the pixel staircase along the coast
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; tmp[i] = (sd[x > 0 ? i - 1 : i] + sd[i] + sd[x < w - 1 ? i + 1 : i]) / 3; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; sd[i] = (tmp[y > 0 ? i - w : i] + tmp[i] + tmp[y < h - 1 ? i + w : i]) / 3; }
  }
  SDF.d = sd;
})();
// distance from the coast at a battlefield position: > 0 inland, < 0 out to sea
function sdf(x, z) {
  const u = clamp((x + MAP.x) / SDF.cell - 0.5, 0, SDF.w - 1.001), v = clamp((z + MAP.z) / SDF.cell - 0.5, 0, SDF.h - 1.001);
  const i = u | 0, j = v | 0, fu = u - i, fv = v - j, d = SDF.d, k = j * SDF.w + i;
  return (d[k] * (1 - fu) + d[k + 1] * fu) * (1 - fv) + (d[k + SDF.w] * (1 - fu) + d[k + SDF.w + 1] * fu) * fv;
}
// unit vector pointing inland
function sdGrad(x, z) { const gx = sdf(x + 30, z) - sdf(x - 30, z), gz = sdf(x, z + 30) - sdf(x, z - 30), l = Math.hypot(gx, gz) || 1; return [gx / l, gz / l]; }
function terrainH(x, z) {
  const d = sdf(x, z);
  if (d <= 0) return Math.max(d * 0.07, -25);
  const k = Math.min(d / 250, 1);
  let h = Math.min(d * 0.07, 7) + k * (Math.sin(x * 0.011) * Math.cos(z * 0.013) + 1) * 2.5
    + k * (Math.sin(x * 0.003 + 2) * Math.sin(z * 0.004) + 1) * 4;
  for (const a of AIRPORT) {           // airfields are graded flat
    const o = Math.max(Math.abs(x - a.x) - 215, Math.abs(z - a.z) - 85);
    if (o < 90) { const f = o <= 0 ? 1 : 1 - o / 90; h = h + (13 - h) * f * f * (3 - 2 * f); }
  }
  return h;
}
// nudge a place until it is properly ashore (want > 0) or properly afloat (want < 0)
function snapTo(p, want) {
  for (let i = 0; i < 120; i++) {
    const d = sdf(p.x, p.z); if (want > 0 ? d >= want : d <= want) break;
    const g = sdGrad(p.x, p.z), s = want > 0 ? 20 : -20; p.x += g[0] * s; p.z += g[1] * s;
  }
  p.x = Math.round(p.x); p.z = Math.round(p.z);
}
for (const p of POINTS) { snapTo(p, p.sea ? -340 : 180); NODE[p.lane][p.col + 1] = p; }
snapTo(NODE[SEA_LANE][0], -300); snapTo(NODE[SEA_LANE][COLS + 1], -300);
for (const H of HOME) {                // each side's harbour: walk from inland to the shore, the port lies just off it
  let x = H.dockFrom.x, z = H.dockFrom.z, g = 0;
  while (sdf(x, z) > 0 && g++ < 600) { x += H.dockDir[0] * 10; z += H.dockDir[1] * 10; }
  H.dock = { x: x - H.dockDir[0] * 6, z: z - H.dockDir[1] * 6 };
  H.port = { x: x + H.dockDir[0] * 280, z: z + H.dockDir[1] * 280 }; snapTo(H.port, -220);
}

// ---- route-finding: a coarse grid of land cells and of navigable water cells. A "field" for a destination tells
// every cell which neighbour to step to next, so tanks go round bays and ships go round headlands.
const NAV = { c: 100, w: 2 * MAP.x / 100, h: 2 * MAP.z / 100, land: null, sea: null, cache: new Map() };
(function () {
  const n = NAV.w * NAV.h; NAV.land = new Uint8Array(n); NAV.sea = new Uint8Array(n);
  for (let j = 0; j < NAV.h; j++) for (let i = 0; i < NAV.w; i++) {
    const d = sdf((i + 0.5) * NAV.c - MAP.x, (j + 0.5) * NAV.c - MAP.z);
    NAV.land[j * NAV.w + i] = d > 30 ? 1 : 0; NAV.sea[j * NAV.w + i] = d < -75 ? 1 : 0;
  }
})();
function navCell(x, z) { return clamp(Math.floor((z + MAP.z) / NAV.c), 0, NAV.h - 1) * NAV.w + clamp(Math.floor((x + MAP.x) / NAV.c), 0, NAV.w - 1); }
function navNear(c, pass) {             // the closest usable cell to c
  if (pass[c]) return c;
  const ci = c % NAV.w, cj = (c / NAV.w) | 0;
  for (let r = 1; r < 7; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NAV.w || j >= NAV.h) continue;
    if (pass[j * NAV.w + i]) return j * NAV.w + i;
  }
  return -1;
}
function navField(gx, gz, sea) {
  const pass = sea ? NAV.sea : NAV.land, g = navNear(navCell(gx, gz), pass); if (g < 0) return null;
  const key = sea ? -g - 1 : g; let f = NAV.cache.get(key); if (f) return f;
  if (NAV.cache.size > 120) NAV.cache.clear();
  const W = NAV.w, H = NAV.h; f = new Int16Array(W * H).fill(-1); f[g] = g;
  const q = new Int32Array(W * H); let qh = 0, qt = 0; q[qt++] = g;
  while (qh < qt) {
    const c = q[qh++], i = c % W, j = (c / W) | 0;
    for (let k = 0; k < 8; k++) {
      const di = [1, -1, 0, 0, 1, 1, -1, -1][k], dj = [0, 0, 1, -1, 1, -1, 1, -1][k], ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nc = nj * W + ni; if (!pass[nc] || f[nc] >= 0) continue;
      if (k > 3 && (!pass[j * W + ni] || !pass[nj * W + i])) continue;      // no cutting corners
      f[nc] = c; q[qt++] = nc;
    }
  }
  NAV.cache.set(key, f); return f;
}
function lineClear(x0, z0, x1, z1, sea) {
  const L = Math.hypot(x1 - x0, z1 - z0); if (L > 2600) return false;
  const n = Math.ceil(L / 70);
  for (let k = 1; k < n; k++) { const d = sdf(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n); if (sea ? d > -70 : d < 25) return false; }
  return true;
}
// where to steer to get from (x, z) to the goal: straight at it when nothing is in the way, otherwise along the route
function navTo(x, z, gx, gz, sea, out) {
  out.x = gx; out.z = gz;
  if (lineClear(x, z, gx, gz, sea)) return out;
  const f = navField(gx, gz, sea); if (!f) return out;
  let c = navCell(x, z);
  if (f[c] < 0) { c = navNear(c, sea ? NAV.sea : NAV.land); if (c < 0 || f[c] < 0) return out; }
  else for (let k = 0; k < 3; k++) { if (f[c] === c) return out; c = f[c]; }
  out.x = (c % NAV.w + 0.5) * NAV.c - MAP.x; out.z = (((c / NAV.w) | 0) + 0.5) * NAV.c - MAP.z;
  return out;
}
function lerp(a, b, k) { return a + (b - a) * k; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function rnd(a, b) { return a + Math.random() * (b - a); }

const SEASONS = [
  { name: 'Summer', icon: '☀', desc: 'Heat wave: the sea is rising', sky: 0x8ec9f0, fog: 0.00028, water: 3.5, tint: [0.80, 0.74, 0.40], tk: 0.18, light: 1.1, tree: 0x2f6b2a, vis: 1, reload: 1 },
  { name: 'Fall', icon: '🍂', desc: 'Thick fog: hard to see anything', sky: 0xb5b2a8, fog: 0.0042, water: 0, tint: [0.70, 0.42, 0.14], tk: 0.45, light: 0.75, tree: 0xb8621b, vis: 0.33, reload: 1 },
  { name: 'Winter', icon: '❄', desc: 'Ice: icebergs drift in the shipping lanes', sky: 0xcfdde8, fog: 0.0008, water: -0.4, tint: [0.95, 0.96, 1.0], tk: 0.88, light: 0.95, tree: 0xe8eef2, vis: 0.9, reload: 1 },
  { name: 'Rainy Season', icon: '🌧', desc: 'Downpour: crews are miserable and slow', sky: 0x5f6b75, fog: 0.0017, water: 1.2, tint: [0.18, 0.46, 0.2], tk: 0.3, light: 0.6, tree: 0x2c7a34, vis: 0.7, reload: 1.35 }
];
const SEASON_LEN = 75, SEASON_FADE = 9;

const World = {
  water: 0, vis: 1, reload: 1, season: 0, seasonT: 0, icebergs: [],
  cur: null,

  init(scene) {
    this.scene = scene;
    const s = SEASONS[0];
    this.cur = { sky: new THREE.Color(s.sky), fog: s.fog, water: s.water, tint: s.tint.slice(), tk: s.tk, light: s.light, tree: new THREE.Color(s.tree), vis: s.vis };
    this.water = s.water;
    scene.background = new THREE.Color(s.sky);
    scene.fog = new THREE.FogExp2(s.sky, s.fog);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x5a5a48, 0.75); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 0.8); this.sun.position.set(-0.5, 1, 0.35); scene.add(this.sun);

    // terrain
    const W = MAP.x * 2 + 1600, D = MAP.z * 2 + 1600;
    const geo = new THREE.PlaneGeometry(W, D, 420, 250); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, n = p.count;
    this.baseCol = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), z = p.getZ(i), h = terrainH(x, z);
      p.setY(i, h);
      let r, g, b; const v = (Math.sin(x * 0.05) * Math.cos(z * 0.07) + 1) * 0.04;
      if (h < 0.8) { r = 0.76; g = 0.70; b = 0.50; if (h < -3) { r = 0.45; g = 0.5; b = 0.42; } }
      else if (h < 9) { r = 0.30 + v; g = 0.50 + v; b = 0.22; }
      else { r = 0.36 + v; g = 0.46 + v; b = 0.25; }
      this.baseCol[i * 3] = r; this.baseCol[i * 3 + 1] = g; this.baseCol[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    scene.add(this.terrain);
    this.heights = p;
    this.applyTint();

    // water
    this.waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(26000, 26000), new THREE.MeshLambertMaterial({ color: 0x1d5f8c, transparent: true, opacity: 0.86 }));
    this.waterMesh.rotation.x = -Math.PI / 2; scene.add(this.waterMesh);

    // trees
    const tg = new THREE.ConeGeometry(3, 9, 6); tg.translate(0, 5.5, 0);
    this.treeMat = new THREE.MeshLambertMaterial({ color: s.tree });
    const N = 7000; this.trees = new THREE.InstancedMesh(tg, this.treeMat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    let c = 0, guard = 0;
    while (c < N && guard++ < 150000) {
      const x = rnd(-MAP.x - 300, MAP.x + 300), z = rnd(-MAP.z - 300, MAP.z + 300);
      if (sdf(x, z) < 60) continue;
      let ok = true;
      for (const b of BASE) if (Math.abs(x - b.x) < 260 && Math.abs(z - b.z) < 170) ok = false;
      for (const a of AIRPORT) if (Math.abs(x - a.x) < 330 && Math.abs(z - a.z) < 190) ok = false;
      for (const q of POINTS) if (!q.sea && Math.abs(x - q.x) < 150 && Math.abs(z - q.z) < 150) ok = false;
      if (!ok) continue;
      const k = rnd(0.7, 1.5);
      ps.set(x, terrainH(x, z) - 0.5, z); sc.set(k, k, k); m.compose(ps, q, sc); this.trees.setMatrixAt(c++, m);
    }
    this.trees.count = c; scene.add(this.trees);

    // rain & snow
    const RN = 1400, rp = new Float32Array(RN * 6);
    this.rainOff = [];
    for (let i = 0; i < RN; i++) this.rainOff.push([rnd(-90, 90), rnd(-50, 60), rnd(-90, 90)]);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xb8c8d8, transparent: true, opacity: 0.55 }));
    this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
    const SN = 1200, sp = new Float32Array(SN * 3);
    this.snowOff = [];
    for (let i = 0; i < SN; i++) this.snowOff.push([rnd(-90, 90), rnd(-50, 60), rnd(-90, 90)]);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.38, transparent: true, opacity: 0.9 }));
    this.snow.frustumCulled = false; this.snow.visible = false; scene.add(this.snow);
  },

  get info() { return SEASONS[this.season]; },
  get remaining() { return Math.max(0, SEASON_LEN - this.seasonT); },

  applyTint() {
    const c = this.terrain.geometry.attributes.color, b = this.baseCol, t = this.cur.tint, k = this.cur.tk, hp = this.heights;
    for (let i = 0; i < c.count; i++) {
      const kk = hp.getY(i) < 0.8 ? k * 0.35 : k;
      c.setXYZ(i, lerp(b[i * 3], t[0], kk), lerp(b[i * 3 + 1], t[1], kk), lerp(b[i * 3 + 2], t[2], kk));
    }
    c.needsUpdate = true;
  },

  // simulation step (season clock + icebergs)
  update(dt) {
    this.seasonT += dt;
    if (this.seasonT >= SEASON_LEN) {
      this.seasonT = 0; this.season = (this.season + 1) % SEASONS.length;
      if (this.onSeason) this.onSeason(this.info);
      if (this.info.name === 'Winter') this.spawnIcebergs();
    }
    const s = this.info, c = this.cur, k = Math.min(1, dt / SEASON_FADE * 3);
    c.sky.lerp(new THREE.Color(s.sky), k); c.tree.lerp(new THREE.Color(s.tree), k);
    c.fog = lerp(c.fog, s.fog, k); c.water = lerp(c.water, s.water, k * 0.6); c.light = lerp(c.light, s.light, k);
    c.tk = lerp(c.tk, s.tk, k); c.vis = lerp(c.vis, s.vis, k);
    for (let i = 0; i < 3; i++) c.tint[i] = lerp(c.tint[i], s.tint[i], k);
    this.water = c.water; this.vis = c.vis; this.reload = s.reload;
    if (this.seasonT < SEASON_FADE * 2) { this.tintT = (this.tintT || 0) + dt; if (this.tintT > 0.15) { this.tintT = 0; this.applyTint(); } }

    const winter = s.name === 'Winter';
    for (let i = this.icebergs.length - 1; i >= 0; i--) {
      const b = this.icebergs[i];
      b.k = clamp(b.k + (winter ? dt / 6 : -dt / 8), 0, 1);
      b.x += b.vx * dt; b.z += b.vz * dt;
      if (terrainH(b.x, b.z) > -6 || Math.abs(b.x) > MAP.x || Math.abs(b.z) > MAP.z) { b.vx = -b.vx; b.vz = -b.vz; b.x += b.vx * dt * 2; b.z += b.vz * dt * 2; }
      b.mesh.position.set(b.x, this.water - b.r * 0.15 * b.k, b.z);
      b.mesh.scale.setScalar(Math.max(0.01, b.k));
      if (b.k <= 0 && !winter) { this.scene.remove(b.mesh); this.icebergs.splice(i, 1); }
    }
  },

  spawnIcebergs() {
    let tries = 0;
    while (this.icebergs.length < 110 && tries++ < 3000) {
      const x = rnd(-MAP.x + 100, MAP.x - 100), z = rnd(-MAP.z + 80, MAP.z - 80);
      if (terrainH(x, z) > -8) continue;
      const r = rnd(14, 34), mesh = mIceberg(r);
      mesh.rotation.y = rnd(0, 6); this.scene.add(mesh);
      this.icebergs.push({ x, z, r, k: 0, vx: rnd(-1.5, 1.5), vz: rnd(-1.5, 1.5), mesh });
    }
  },

  // visuals that follow the camera (runs every rendered frame)
  render(dt, cam, time) {
    const c = this.cur, s = this.info;
    this.scene.background.copy(c.sky); this.scene.fog.color.copy(c.sky); this.scene.fog.density = c.fog;
    this.hemi.intensity = 0.75 * c.light; this.sun.intensity = 0.8 * c.light;
    this.treeMat.color.copy(c.tree);
    this.waterMesh.position.set(cam.position.x, this.water + Math.sin(time * 0.8) * 0.12, cam.position.z);
    const raining = s.name === 'Rainy Season' && this.seasonT > 2, snowing = s.name === 'Winter' && this.seasonT > 2;
    this.rain.visible = raining; this.snow.visible = snowing;
    if (raining) {
      const a = this.rain.geometry.attributes.position, o = this.rainOff;
      for (let i = 0; i < o.length; i++) {
        o[i][1] -= 110 * dt; o[i][0] -= 14 * dt;
        if (o[i][1] < -50) { o[i][1] += 110; o[i][0] = rnd(-90, 90); }
        a.setXYZ(i * 2, o[i][0], o[i][1], o[i][2]); a.setXYZ(i * 2 + 1, o[i][0] + 0.5, o[i][1] + 3.6, o[i][2]);
      }
      a.needsUpdate = true; this.rain.position.copy(cam.position);
    }
    if (snowing) {
      const a = this.snow.geometry.attributes.position, o = this.snowOff;
      for (let i = 0; i < o.length; i++) {
        o[i][1] -= 9 * dt; o[i][0] += Math.sin(time + i) * 2 * dt;
        if (o[i][1] < -50) o[i][1] += 110;
        a.setXYZ(i, o[i][0], o[i][1], o[i][2]);
      }
      a.needsUpdate = true; this.snow.position.copy(cam.position);
    }
  }
};

'use strict';
// ---------- terrain, water, seasons, weather, icebergs ----------
function coastZ(x) { return 70 * Math.sin(x * 0.0023) + 40 * Math.sin(x * 0.0061 + 1.3); }
function terrainH(x, z) {
  const d = coastZ(x) - z;             // > 0 inland (north), < 0 out to sea (south)
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
    const geo = new THREE.PlaneGeometry(W, D, 400, 200); geo.rotateX(-Math.PI / 2);
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
    const N = 4200; this.trees = new THREE.InstancedMesh(tg, this.treeMat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    let c = 0, guard = 0;
    while (c < N && guard++ < 60000) {
      const x = rnd(-MAP.x - 300, MAP.x + 300), z = rnd(-MAP.z - 300, 60);
      if (coastZ(x) - z < 60) continue;
      let ok = true;
      for (const b of BASE) if (Math.abs(x - b.x) < 260 && Math.abs(z - b.z) < 170) ok = false;
      for (const a of AIRPORT) if (Math.abs(x - a.x) < 330 && Math.abs(z - a.z) < 190) ok = false;
      for (const q of POINTS) if (!q.sea && Math.abs(x - q.x) < 150 && Math.abs(z - q.z) < 150) ok = false;
      if (Math.abs(z - BASE[0].z) < 60 && Math.abs(x) < BASE[1].x) ok = false; // keep the main road clear
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
      if (terrainH(b.x, b.z) > -6 || Math.abs(b.x) > MAP.x) { b.vx = -b.vx; b.vz = Math.abs(b.vz); }
      if (b.z > MAP.z) b.vz = -Math.abs(b.vz);
      b.mesh.position.set(b.x, this.water - b.r * 0.15 * b.k, b.z);
      b.mesh.scale.setScalar(Math.max(0.01, b.k));
      if (b.k <= 0 && !winter) { this.scene.remove(b.mesh); this.icebergs.splice(i, 1); }
    }
  },

  spawnIcebergs() {
    let tries = 0;
    while (this.icebergs.length < 110 && tries++ < 3000) {
      const x = rnd(-MAP.x + 100, MAP.x - 100), z = rnd(120, MAP.z - 80);
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

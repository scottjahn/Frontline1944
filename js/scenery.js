'use strict';
// ---------- what the battlefield looks like: terrain mesh, water, trees, sky, rain, snow and icebergs ----------
// Reads the conditions from World (world.js) and only ever draws them; the rules never look in here.
const Scenery = {
  cur: null, ice: new Map(),

  init(scene) {
    this.scene = scene;
    const s = World.info;
    this.cur = { sky: new THREE.Color(s.sky), fog: s.fog, tint: s.tint.slice(), tk: s.tk, light: s.light, tree: new THREE.Color(s.tree) };
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
      if (h > 0.8) {
        const fo = Math.min(1, fsamp(FEAT.f, x, z) * 1.4), mt = fsamp(FEAT.m, x, z);
        if (fo > 0) { r = lerp(r, 0.17, fo); g = lerp(g, 0.34, fo); b = lerp(b, 0.15, fo); }             // forest floor
        if (h > 30 && mt > 0.15) { const q = Math.min(1, (h - 30) / 26) * Math.min(1, mt * 3); r = lerp(r, 0.47 + v, q); g = lerp(g, 0.43 + v, q); b = lerp(b, 0.36, q); }   // bare rock
        if (h > 94) { const q = Math.min(1, (h - 94) / 12); r = lerp(r, 0.93, q); g = lerp(g, 0.94, q); b = lerp(b, 0.96, q); }    // snow on the peaks
      }
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
    const NS = 7000, NF = TERRAIN.some(s => s[0] === 'forest') ? 12000 : 0, N = NS + NF; this.trees = new THREE.InstancedMesh(tg, this.treeMat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    let c = 0, guard = 0;
    const woodStamps = TERRAIN.filter(s => s[0] === 'forest').map(s => { const p = LL(s[1], s[2]); return [p.x, p.z, s[3]]; });
    while (c < N && guard++ < 400000) {
      const woods = c >= NS || guard > 150000; if (woods && !NF) break;
      let x, z;
      if (woods) { const w = woodStamps[(Math.random() * woodStamps.length) | 0], a = rnd(0, 6.283), r = Math.sqrt(Math.random()) * w[2]; x = w[0] + Math.sin(a) * r; z = w[1] + Math.cos(a) * r; }
      else { x = rnd(-MAP.x - 300, MAP.x + 300); z = rnd(-MAP.z - 300, MAP.z + 300); }
      if (sdf(x, z) < 60 || fsamp(FEAT.m, x, z) > 0.55) continue;                 // none out at sea or above the tree line
      if (woods) { const f = fsamp(FEAT.f, x, z); if (f < 0.2 || Math.random() > f * 1.3) continue; }   // the rest grow in the woods
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

  applyTint() {
    const c = this.terrain.geometry.attributes.color, b = this.baseCol, t = this.cur.tint, k = this.cur.tk, hp = this.heights;
    for (let i = 0; i < c.count; i++) {
      const kk = hp.getY(i) < 0.8 ? k * 0.35 : k;
      c.setXYZ(i, lerp(b[i * 3], t[0], kk), lerp(b[i * 3 + 1], t[1], kk), lerp(b[i * 3 + 2], t[2], kk));
    }
    c.needsUpdate = true;
  },

  // the season's colours fade in while the battle runs
  update(dt) {
    const s = World.info, c = this.cur, k = Math.min(1, dt / SEASON_FADE * 3);
    c.sky.lerp(new THREE.Color(s.sky), k); c.tree.lerp(new THREE.Color(s.tree), k);
    c.fog = lerp(c.fog, s.fog, k); c.light = lerp(c.light, s.light, k); c.tk = lerp(c.tk, s.tk, k);
    for (let i = 0; i < 3; i++) c.tint[i] = lerp(c.tint[i], s.tint[i], k);
    if (World.seasonT < SEASON_FADE * 2) { this.tintT = (this.tintT || 0) + dt; if (this.tintT > 0.15) { this.tintT = 0; this.applyTint(); } }
  },

  // visuals that follow the camera (runs every rendered frame)
  render(dt, cam, time) {
    const c = this.cur, s = World.info;
    this.scene.background.copy(c.sky); this.scene.fog.color.copy(c.sky); this.scene.fog.density = c.fog;
    this.hemi.intensity = 0.75 * c.light; this.sun.intensity = 0.8 * c.light;
    this.treeMat.color.copy(c.tree);
    this.waterMesh.position.set(cam.position.x, World.water + Math.sin(time * 0.8) * 0.12, cam.position.z);
    const seen = new Set();
    for (const b of World.icebergs) {
      let m = this.ice.get(b.id);
      if (!m) { m = mIceberg(b.r); m.rotation.y = b.rot; this.scene.add(m); this.ice.set(b.id, m); }
      m.position.set(b.x, World.water - b.r * 0.15 * b.k, b.z); m.scale.setScalar(Math.max(0.01, b.k)); seen.add(b.id);
    }
    for (const [id, m] of this.ice) if (!seen.has(id)) { this.scene.remove(m); this.ice.delete(id); }
    const raining = s.rain && World.seasonT > 2, snowing = s.snow && World.seasonT > 2;
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

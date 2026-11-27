'use strict';
// ---------- terrain stamps: shared by the game (world.js) and the map builder (editor.js) ----------
// A map's terrain is a list of stamps [kind, lon, lat, radius]. The radius is in battlefield units.
//   land / water   add or cut away ground (islands, lakes, rivers, channels)
//   mtn / hill     raise mountains or rolling hills
//   forest         woods: slow ground vehicles, hide them and soak up some damage
//   flat           erase mountains, hills and forest under the brush
// Each painter draws onto a canvas through P(lon, lat) -> [px, py], with k pixels per battlefield unit.
const STAMP_KINDS = ['land', 'water', 'mtn', 'hill', 'forest', 'flat'];

// a run of stamps along a line (for writing mountain ranges and forest belts by hand)
function stampLine(kind, pts, r, n) {
  const out = [];
  if (pts.length === 1) return [[kind, pts[0][0], pts[0][1], r]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let j = 0; j < n; j++) { const t = j / n; out.push([kind, +(a[0] + (b[0] - a[0]) * t).toFixed(3), +(a[1] + (b[1] - a[1]) * t).toFixed(3), r]); }
  }
  const z = pts[pts.length - 1]; out.push([kind, z[0], z[1], r]);
  return out;
}

// the coastline: outline polygons, then land / water stamps in order. Fills `fill` where there is land.
function paintLand(c, land, stamps, P, k, fill) {
  c.save(); c.fillStyle = fill || '#fff';
  for (const poly of land) {
    c.beginPath(); poly.forEach((q, i) => { const p = P(q[0], q[1]); c[i ? 'lineTo' : 'moveTo'](p[0], p[1]); }); c.closePath(); c.fill();
  }
  for (const s of stamps) {
    if (s[0] !== 'land' && s[0] !== 'water') continue;
    const p = P(s[1], s[2]);
    c.globalCompositeOperation = s[0] === 'land' ? 'source-over' : 'destination-out';
    c.beginPath(); c.arc(p[0], p[1], Math.max(0.6, s[3] * k), 0, 6.2832); c.fill();
  }
  c.restore();
}

// relief: red = mountains, green = hills, summed up where stamps overlap. The canvas must start opaque black.
function paintRelief(c, stamps, P, k) {
  c.save();
  for (const s of stamps) {
    const kind = s[0]; if (kind !== 'mtn' && kind !== 'hill' && kind !== 'flat') continue;
    const p = P(s[1], s[2]), r = Math.max(1, s[3] * k), g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
    if (kind === 'flat') { c.globalCompositeOperation = 'source-over'; g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    else {
      c.globalCompositeOperation = 'lighter';
      const ch = kind === 'mtn' ? '255,0,0' : '0,255,0', a = kind === 'mtn' ? 0.5 : 0.45;
      g.addColorStop(0, `rgba(${ch},${a})`); g.addColorStop(0.45, `rgba(${ch},${a * 0.78})`); g.addColorStop(0.8, `rgba(${ch},${a * 0.3})`); g.addColorStop(1, `rgba(${ch},0)`);
    }
    c.fillStyle = g; c.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
  }
  c.restore();
}

// woods: red = how dense the forest is. The canvas must start opaque black.
function paintForest(c, stamps, P, k) {
  c.save();
  for (const s of stamps) {
    const kind = s[0]; if (kind !== 'forest' && kind !== 'flat') continue;
    const p = P(s[1], s[2]), r = Math.max(1, s[3] * k), g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
    if (kind === 'flat') { c.globalCompositeOperation = 'source-over'; g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    else { c.globalCompositeOperation = 'lighter'; g.addColorStop(0, 'rgba(255,0,0,.6)'); g.addColorStop(0.55, 'rgba(255,0,0,.5)'); g.addColorStop(1, 'rgba(255,0,0,0)'); }
    c.fillStyle = g; c.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
  }
  c.restore();
}

// keep capture points, headquarters and airfields fightable: no mountains or hills on them.
// spots: [px, py, r0, r1] in pixels, fully flat inside r0, fading out to r1.
function maskRelief(c, spots) {
  c.save(); c.globalCompositeOperation = 'source-over';
  for (const s of spots) {
    const g = c.createRadialGradient(s[0], s[1], 0, s[0], s[1], s[3]);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(s[2] / s[3], 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(s[0] - s[3], s[1] - s[3], s[3] * 2, s[3] * 2);
  }
  c.restore();
}
// ---- the same painters worked out on plain arrays instead of a canvas, so the battlefield can be built where there
// is no browser (the game server). The game uses these for the terrain everywhere, so every machine gets the same map.
// Each grid is w*h values; P and k work as above.
// land: 1 where there is land, 0 for water
function rasterLand(w, h, land, stamps, P, k) {
  const out = new Uint8Array(w * h);
  for (const poly of land) rasterPoly(out, w, h, poly.map(q => P(q[0], q[1])));
  for (const s of stamps) {
    if (s[0] !== 'land' && s[0] !== 'water') continue;
    const p = P(s[1], s[2]), r = Math.max(0.6, s[3] * k), v = s[0] === 'land' ? 1 : 0;
    rasterSpot(w, h, p[0], p[1], r, (i, t) => { out[i] = v; }, true);
  }
  return out;
}
// fill a polygon (non-zero winding, like a canvas), testing each pixel's centre
function rasterPoly(out, w, h, pts) {
  const n = pts.length, xs = []; let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
    const cy = y + 0.5; xs.length = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] <= cy) !== (b[1] <= cy)) xs.push([a[0] + (cy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), b[1] > a[1] ? 1 : -1]);
    }
    xs.sort((p, q) => p[0] - q[0]);
    let wind = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      wind += xs[i][1]; if (!wind) continue;
      const xa = Math.max(0, Math.ceil(xs[i][0] - 0.5)), xb = Math.min(w - 1, Math.ceil(xs[i + 1][0] - 0.5) - 1);
      for (let x = xa; x <= xb; x++) out[y * w + x] = 1;
    }
  }
}
// call fn(index, t) for each pixel whose centre is within r of (cx, cy); t = distance / r
function rasterSpot(w, h, cx, cy, r, fn) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r; if (t <= 1) fn(y * w + x, t);
  }
}
// the opacity of a radial gradient at t: stops are [t, alpha] pairs in order
function rampAt(stops, t) {
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const a = stops[i - 1], b = stops[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
  return stops[stops.length - 1][1];
}
const RAMP = {
  mtn: [[0, 0.5], [0.45, 0.39], [0.8, 0.15], [1, 0]], hill: [[0, 0.45], [0.45, 0.351], [0.8, 0.135], [1, 0]],
  forest: [[0, 0.6], [0.55, 0.5], [1, 0]], flat: [[0, 1], [0.6, 0.9], [1, 0]]
};
// relief: m = mountains, hl = hills, 0..255 like paintRelief's red and green, with maskRelief's flat spots applied
function rasterRelief(w, h, stamps, P, k, spots) {
  const m = new Float32Array(w * h), hl = new Float32Array(w * h);
  for (const s of stamps) {
    const kind = s[0]; if (kind !== 'mtn' && kind !== 'hill' && kind !== 'flat') continue;
    const p = P(s[1], s[2]), r = Math.max(1, s[3] * k), ramp = RAMP[kind];
    if (kind === 'flat') rasterSpot(w, h, p[0], p[1], r, (i, t) => { const a = 1 - rampAt(ramp, t); m[i] *= a; hl[i] *= a; });
    else { const ch = kind === 'mtn' ? m : hl; rasterSpot(w, h, p[0], p[1], r, (i, t) => { ch[i] = Math.min(255, ch[i] + 255 * rampAt(ramp, t)); }); }
  }
  for (const s of spots) {
    const ramp = [[0, 1], [s[2] / s[3], 1], [1, 0]];
    rasterSpot(w, h, s[0], s[1], s[3], (i, t) => { const a = 1 - rampAt(ramp, t); m[i] *= a; hl[i] *= a; });
  }
  return { m, hl };
}
// woods: 0..255 like paintForest's red
function rasterForest(w, h, stamps, P, k) {
  const f = new Float32Array(w * h);
  for (const s of stamps) {
    const kind = s[0]; if (kind !== 'forest' && kind !== 'flat') continue;
    const p = P(s[1], s[2]), r = Math.max(1, s[3] * k), ramp = RAMP[kind];
    if (kind === 'flat') rasterSpot(w, h, p[0], p[1], r, (i, t) => { f[i] *= 1 - rampAt(ramp, t); });
    else rasterSpot(w, h, p[0], p[1], r, (i, t) => { f[i] = Math.min(255, f[i] + 255 * rampAt(ramp, t)); });
  }
  return f;
}
// smooth value noise, 0..1, one bump per unit
function vhash(i, j) { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = vhash(i, j), b = vhash(i + 1, j), c = vhash(i, j + 1), d = vhash(i + 1, j + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
// height the relief adds at battlefield (x, z), from mountain m and hill hl strength (0..1). Peaks reach about 110.
function reliefH(m, hl, x, z) {
  const s = Math.min(1, m * 1.15), sm = s * s * (3 - 2 * s);
  const n1 = vnoise(x / 420, z / 420), n2 = vnoise(x / 150 + 31, z / 150 + 17), n3 = vnoise(x / 900 + 7, z / 900 + 3);
  return hl * 26 * (0.6 + 0.4 * n1) + sm * 118 * (0.35 + 0.3 * n1 + 0.15 * n2 + 0.2 * n3) + m * 14 * (n2 - 0.5);
}
// how far (battlefield units) the flattening reaches around each kind of place
const RELIEF_CLEAR = { point: [260, 430], hq: [330, 560], airport: [380, 600], depot: [160, 280] };

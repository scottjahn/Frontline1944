'use strict';
// ---------- Map Builder: paint coastlines and terrain, move capture points and headquarters, name the sectors ----------
// Maps are stored with the game's custom maps (theatres.js: loadMaps / saveMaps) and played as 'map-<id>'.
const $ = id => document.getElementById(id);
const MAPX = 7000, MAPZ = 3750;                 // battlefield half-size (defs.js MAP)
const cv = $('map'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, K = W / (2 * MAPX);   // pixels per battlefield unit

const TOOLS = [
  { id: 'move', label: 'Move', col: '#f2c14e' },
  { id: 'land', label: 'Land', col: '#4b6a3d' },
  { id: 'water', label: 'Water', col: '#1d4a66' },
  { id: 'mtn', label: 'Mountains', col: '#8a7d64' },
  { id: 'hill', label: 'Hills', col: '#7f9150' },
  { id: 'forest', label: 'Forest', col: '#264a24' },
  { id: 'flat', label: 'Flatten', col: '#c9c08f' }
];
let map = null, B = null, tool = 'land', brush = 260, sel = null, drag = null, stroke = null, hover = null, dirty = true;
const undo = [], redo = [];

// ---- coordinates
const P = (lon, lat) => [(lon - B.box.lon0) / (B.box.lon1 - B.box.lon0) * W, (B.box.lat1 - lat) / (B.box.lat1 - B.box.lat0) * H];
const LLof = (x, y) => [+(B.box.lon0 + x / W * (B.box.lon1 - B.box.lon0)).toFixed(3), +(B.box.lat1 - y / H * (B.box.lat1 - B.box.lat0)).toFixed(3)];
function evXY(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }

// ---- the things you can drag: 21 sector points, 3 homeland points, 2 headquarters, 2 airfields
function markers() {
  const out = [];
  for (let c = 0; c < 7; c++) for (let l = 0; l < 3; l++) out.push({ kind: 'pt', c, l, q: map.lanes[l][c + 1] });
  for (let c = 0; c < 3; c++) out.push({ kind: 'home', c, q: map.homeNodes[c + 1] });
  for (let t = 0; t < 2; t++) { out.push({ kind: 'hq', t, q: map.hq[t] }); out.push({ kind: 'air', t, q: map.airport[t] }); }
  return out;
}
const same = (a, b) => a && b && a.kind === b.kind && a.c === b.c && a.l === b.l && a.t === b.t;
function markerAt(x, y) {
  let best = null, bd = 14;
  for (const m of markers()) { const p = P(m.q[0], m.q[1]), d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = m; } }
  return best;
}
// moving a headquarters takes its depots, harbour and staging areas along
function moveMarker(m, lon, lat) {
  const dx = lon - m.q[0], dy = lat - m.q[1], sh = q => { q[0] = +(q[0] + dx).toFixed(3); q[1] = +(q[1] + dy).toFixed(3); };
  if (m.kind === 'hq') {
    const h = map.home[m.t]; for (const k of ['depot', 'airDepot', 'dockFrom', 'seaFar']) sh(h[k]);
    for (let l = 0; l < 3; l++) sh(map.lanes[l][m.t ? 8 : 0]);
    if (m.t === 0) sh(map.homeNodes[0]);
  }
  m.q[0] = lon; m.q[1] = lat;
}
function sideName(t) { return sideAdj(B, t); }
function markerName(m) {
  if (m.kind === 'pt') return map.pointNames[m.c][m.l];
  if (m.kind === 'home') return map.homeNames[m.c];
  return sideName(m.t) + (m.kind === 'hq' ? ' headquarters' : ' airfield');
}

// ---- drawing
const off = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const maskCv = off(W, H), layerCv = off(W, H), RW = W >> 1, RH = H >> 1, reliefCv = off(RW, RH), forestCv = off(RW, RH), smallMask = off(RW, RH), overCv = off(RW, RH);
function render() {
  dirty = false;
  const c = ctx;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#163a52'); g.addColorStop(1, '#1d4a66'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  // land
  const mc = maskCv.getContext('2d'); mc.clearRect(0, 0, W, H);
  paintLand(mc, map.coast ? B.land : [], map.stamps, P, K, '#000');
  const layer = (col, grow, alpha) => {
    const lc = layerCv.getContext('2d'); lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, W, H);
    for (let a = 0; a < 8 && grow; a++) lc.drawImage(maskCv, Math.cos(a * 0.785) * grow, Math.sin(a * 0.785) * grow);
    lc.drawImage(maskCv, 0, 0); lc.globalCompositeOperation = 'source-in'; lc.fillStyle = col; lc.fillRect(0, 0, W, H);
    c.globalAlpha = alpha; c.drawImage(layerCv, 0, 0); c.globalAlpha = 1;
  };
  layer('rgb(120,170,190)', 5, 0.25); layer('#c9c08f', 1.4, 1); layer('#4b6a3d', 0, 1);
  // relief and woods, at half size, shaded by a rough height
  const k2 = K / 2, P2 = (lon, lat) => { const p = P(lon, lat); return [p[0] / 2, p[1] / 2]; };
  const rc = reliefCv.getContext('2d'); rc.globalCompositeOperation = 'source-over'; rc.fillStyle = '#000'; rc.fillRect(0, 0, RW, RH);
  paintRelief(rc, map.stamps, P2, k2); maskRelief(rc, clearSpots(P2, k2));
  const fc = forestCv.getContext('2d'); fc.globalCompositeOperation = 'source-over'; fc.fillStyle = '#000'; fc.fillRect(0, 0, RW, RH);
  paintForest(fc, map.stamps, P2, k2);
  const sm = smallMask.getContext('2d'); sm.clearRect(0, 0, RW, RH); sm.drawImage(maskCv, 0, 0, RW, RH);
  const R = rc.getImageData(0, 0, RW, RH).data, F = fc.getImageData(0, 0, RW, RH).data, M = sm.getImageData(0, 0, RW, RH).data;
  const hgt = new Float32Array(RW * RH);
  for (let i = 0; i < RW * RH; i++) {
    const m = R[i * 4] / 255, hl = R[i * 4 + 1] / 255;
    hgt[i] = M[i * 4 + 3] > 100 && (m > 0.003 || hl > 0.003) ? 10 + reliefH(m, hl, ((i % RW) * 2 + 1) / K - MAPX, (((i / RW) | 0) * 2 + 1) / K - MAPZ) : 0;
  }
  const oc = overCv.getContext('2d'), im = oc.createImageData(RW, RH), px = im.data;
  for (let j = 1; j < RH - 1; j++) for (let i = 1; i < RW - 1; i++) {
    const n = j * RW + i; if (M[n * 4 + 3] < 100) continue;
    const t = hgt[n], fo = F[n * 4] / 255, shade = Math.max(-0.6, Math.min(0.6, (hgt[n - 1] - hgt[n + 1] + hgt[n - RW] - hgt[n + RW]) * 0.02));
    let r = 75, gg = 106, b = 61, a = 0;
    if (fo > 0.12) { r = 38; gg = 70; b = 36; a = Math.min(1, fo * 1.5) * 0.85; }
    if (t > 28) { const q = Math.min(1, (t - 28) / 34); r += (128 - r) * q; gg += (114 - gg) * q; b += (88 - b) * q; a = Math.max(a, q * 0.9); }
    if (t > 94) { const q = Math.min(1, (t - 94) / 12); r += (236 - r) * q; gg += (236 - gg) * q; b += (232 - b) * q; }
    if (Math.abs(shade) > 0.02) { a = Math.max(a, Math.min(0.9, Math.abs(shade) * 1.4)); const s = shade > 0 ? 255 : 0, q = Math.abs(shade) * 0.6; r += (s - r) * q; gg += (s - gg) * q; b += (s - b) * q; }
    const o = n * 4; px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = a * 255;
  }
  oc.putImageData(im, 0, 0); c.imageSmoothingEnabled = true; c.drawImage(overCv, 0, 0, W, H);
  // place names of the real map
  if (map.coast) {
    c.textAlign = 'center';
    for (const L of B.labels) {
      const q = P(L[1], L[2]), sea = !!L[4];
      c.font = (sea ? 'italic ' : '700 ') + Math.round(L[3] * 1.2) + 'px "Trebuchet MS",sans-serif'; c.fillStyle = sea ? 'rgba(170,205,225,.45)' : 'rgba(20,30,15,.4)';
      c.fillText(sea ? L[0] : L[0].split('').join(' '), q[0], q[1]);
    }
  }
  // the flattened rings round each place
  c.setLineDash([4, 4]); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.18)';
  for (const s of clearSpots(P, K)) { c.beginPath(); c.arc(s[0], s[1], s[2], 0, 6.283); c.stroke(); }
  c.setLineDash([]);
  // the three lines of advance, and the homeland road
  const line = (pts, col, w) => { c.beginPath(); pts.forEach((q, i) => { const p = P(q[0], q[1]); c[i ? 'lineTo' : 'moveTo'](p[0], p[1]); }); c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
  c.lineJoin = 'round'; c.lineCap = 'round';
  for (let l = 0; l < 3; l++) { line(map.lanes[l], 'rgba(0,0,0,.45)', 5); line(map.lanes[l], l === 2 ? 'rgba(140,200,255,.7)' : 'rgba(242,193,78,.75)', 2); }
  line(map.homeNodes, 'rgba(0,0,0,.45)', 5); line(map.homeNodes, 'rgba(91,147,255,.75)', 2);
  // markers
  c.font = '700 11px "Trebuchet MS",sans-serif'; c.textAlign = 'center';
  const lbl = (s, x, y) => { c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(s, x, y); c.fillStyle = '#f4f1e2'; c.fillText(s, x, y); };
  for (const m of markers()) {
    const [x, y] = P(m.q[0], m.q[1]), on = same(m, sel), hv = same(m, hover);
    if (m.kind === 'pt' || m.kind === 'home') {
      c.beginPath(); c.arc(x, y, on ? 8 : 6, 0, 6.283);
      c.fillStyle = m.kind === 'home' ? '#5b93ff' : m.l === 2 ? '#8cc8ff' : m.l === 1 ? '#f2c14e' : '#e08a3c'; c.fill();
      c.lineWidth = on || hv ? 2.5 : 1.5; c.strokeStyle = on ? '#fff' : '#111'; c.stroke();
      lbl(markerName(m), x, y + 18);
    } else if (m.kind === 'hq') {
      c.fillStyle = m.t ? '#d83030' : '#3a78ff'; c.fillRect(x - 9, y - 9, 18, 18); c.lineWidth = on || hv ? 2.5 : 1.5; c.strokeStyle = on ? '#fff' : '#111'; c.strokeRect(x - 9, y - 9, 18, 18);
      c.fillStyle = '#fff'; c.font = '800 9px "Trebuchet MS",sans-serif'; c.fillText('HQ', x, y + 3); c.font = '700 11px "Trebuchet MS",sans-serif';
      lbl(sideName(m.t) + ' HQ', x, y - 14);
    } else {
      c.fillStyle = m.t ? '#ff8a7a' : '#8fb8ff'; c.fillRect(x - 14, y - 3, 28, 6); c.lineWidth = on || hv ? 2.5 : 1; c.strokeStyle = on ? '#fff' : '#111'; c.strokeRect(x - 14, y - 3, 28, 6);
      lbl('✈', x, y - 8);
    }
  }
  // brush
  if (tool !== 'move' && hover && hover.brush) {
    c.beginPath(); c.arc(hover.brush[0], hover.brush[1], brush * K, 0, 6.283); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke();
    c.beginPath(); c.arc(hover.brush[0], hover.brush[1], brush * K, 0, 6.283); c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.3)'; c.stroke();
  }
}
function clearSpots(Pf, k) {
  const out = [], add = (q, r) => { const p = Pf(q[0], q[1]); out.push([p[0], p[1], r[0] * k, r[1] * k]); };
  for (let c = 0; c < 7; c++) for (let l = 0; l < 2; l++) add(map.lanes[l][c + 1], RELIEF_CLEAR.point);
  for (let c = 1; c <= 3; c++) add(map.homeNodes[c], RELIEF_CLEAR.point);
  for (let t = 0; t < 2; t++) { add(map.hq[t], RELIEF_CLEAR.hq); add(map.airport[t], RELIEF_CLEAR.airport); add(map.home[t].depot, RELIEF_CLEAR.depot); }
  return out;
}
function loop() { if (dirty && map) render(); requestAnimationFrame(loop); }

// ---- editing, undo and saving
let saveT = 0;
function snapshot() { undo.push(JSON.stringify(map)); if (undo.length > 80) undo.shift(); redo.length = 0; refreshButtons(); }
function changed() { dirty = true; clearTimeout(saveT); $('status').textContent = 'Saving…'; saveT = setTimeout(save, 400); }
function save() {
  clearTimeout(saveT); map.updated = Date.now();
  const list = loadMaps(), i = list.findIndex(m => m.id === map.id);
  if (i >= 0) list[i] = map; else list.push(map);
  try { saveMaps(list); $('status').textContent = 'Saved'; } catch (e) { $('status').textContent = 'Could not save: browser storage is full'; }
  fillPicker();
}
function restore(json) { const id = map.id; map = JSON.parse(json); map.id = id; sel = null; changed(); fillPanels(); refreshButtons(); }
function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(map)); restore(undo.pop()); }
function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(map)); restore(redo.pop()); }
function refreshButtons() { $('bUndo').disabled = !undo.length; $('bRedo').disabled = !redo.length; }

function addStamp(x, y) {
  const q = LLof(x, y); map.stamps.push([tool, q[0], q[1], Math.round(brush)]); stroke.last = [x, y]; changed();
}
cv.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  cv.setPointerCapture(e.pointerId);
  const [x, y] = evXY(e);
  if (tool === 'move') {
    const m = markerAt(x, y); sel = m; fillSel(); dirty = true;
    if (m) { snapshot(); drag = m; }
    return;
  }
  snapshot(); stroke = { last: null }; addStamp(x, y);
});
cv.addEventListener('pointermove', e => {
  const [x, y] = evXY(e);
  if (drag) {
    const q = LLof(Math.max(0, Math.min(W, x)), Math.max(0, Math.min(H, y))); moveMarker(drag, q[0], q[1]); changed(); return;
  }
  if (stroke) {                // lay stamps evenly along the stroke, however fast the pointer moved
    const step = Math.max(2, brush * K * 0.5);
    let d = Math.hypot(x - stroke.last[0], y - stroke.last[1]);
    while (d >= step) { const [lx, ly] = stroke.last, k = step / d; addStamp(lx + (x - lx) * k, ly + (y - ly) * k); d -= step; }
  }
  const h = tool === 'move' ? markerAt(x, y) : { brush: [x, y] };
  if (!same(h, hover) || tool !== 'move') { hover = h; dirty = true; }
  cv.style.cursor = tool === 'move' ? (h ? 'grab' : 'default') : 'crosshair';
});
const endDrag = () => { if (drag) fillSel(); drag = null; stroke = null; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('pointerleave', () => { if (!drag && !stroke) { hover = null; dirty = true; } });
cv.addEventListener('wheel', e => { if (tool === 'move') return; e.preventDefault(); setBrush(brush * (e.deltaY > 0 ? 0.9 : 1.1)); }, { passive: false });

// ---- side panel
function setTool(id) { tool = id; for (const b of $('tools').children) b.classList.toggle('on', b.dataset.id === id); hover = null; dirty = true; }
function setBrush(v) { brush = Math.max(40, Math.min(1400, Math.round(v / 10) * 10)); $('size').value = brush; $('sizeV').textContent = (brush / 1000).toFixed(2) + ' km'; dirty = true; }
TOOLS.forEach((t, i) => {
  const b = document.createElement('button'); b.dataset.id = t.id;
  b.innerHTML = `<i style="background:${t.col}"></i>${t.label}<kbd>${i + 1}</kbd>`; b.onclick = () => setTool(t.id); $('tools').append(b);
});
$('size').oninput = e => setBrush(+e.target.value);
function textInput(value, onCommit, max) {
  const inp = document.createElement('input'); inp.type = 'text'; inp.value = value; inp.maxLength = max || 32;
  let snap = false;
  inp.addEventListener('input', () => { if (!snap) { snapshot(); snap = true; } onCommit(inp.value.trim() || value); changed(); });
  inp.addEventListener('change', () => { snap = false; });
  return inp;
}
function fillSel() {
  const box = $('sel'); box.innerHTML = '';
  if (!sel) { box.className = 'hint'; box.innerHTML = 'Use <b>Move</b> and click a capture point, headquarters or airfield to select it. Drag to move it.'; return; }
  box.className = '';
  const info = document.createElement('div'); info.className = 'hint'; info.style.marginBottom = '6px';
  if (sel.kind === 'pt') {
    info.textContent = `${map.sectors[sel.c]} sector · ${['inland point', 'coast point', 'sea point'][sel.l]}`;
    box.append(info, textInput(map.pointNames[sel.c][sel.l], v => { map.pointNames[sel.c][sel.l] = v; }));
  } else if (sel.kind === 'home') {
    info.textContent = `${map.homeName} · homeland point ${sel.c + 1} of 3`;
    box.append(info, textInput(map.homeNames[sel.c], v => { map.homeNames[sel.c] = v; fillPanels(); }));
  } else {
    info.textContent = sel.kind === 'hq' ? `The ${sideName(sel.t)} headquarters. Its depots, harbour and staging areas move with it.` : `The ${sideName(sel.t)} airfield, where aircraft take off.`;
    box.append(info);
  }
}
function fillPanels() {
  $('name').value = map.name;
  $('baseInfo').textContent = `Units, sides and seasons of the ${B.title} campaign (${sideName(0)} vs ${sideName(1)}).`;
  const s = $('sectors'); s.innerHTML = '';
  map.sectors.forEach((n, c) => {
    const sp = document.createElement('span'); sp.textContent = c === 0 ? `1 · ${sideName(0)} end` : c === 6 ? `7 · ${sideName(1)} end` : String(c + 1);
    s.append(sp, textInput(n, v => {
      const old = map.sectors[c]; map.sectors[c] = v;
      // points still called after their sector follow the new name
      for (let l = 0; l < 3; l++) if (map.pointNames[c][l].startsWith(old)) map.pointNames[c][l] = v + map.pointNames[c][l].slice(old.length);
    }));
  });
  const h = $('homeland'); h.innerHTML = '';
  const sp = document.createElement('span'); sp.textContent = 'Name';
  h.append(sp, textInput(map.homeName, v => { map.homeName = v; }));
  map.homeNames.forEach((n, c) => { const sp = document.createElement('span'); sp.textContent = 'Point ' + (c + 1); h.append(sp, textInput(n, v => { map.homeNames[c] = v; })); });
  const hint = document.createElement('div'); hint.className = 'hint'; hint.style.gridColumn = '1 / -1';
  hint.textContent = `${sideName(0)} home ground. While the ${sideName(1)} side holds the invasion point, its landing craft can come ashore here.`;
  h.append(hint);
  fillSel();
}
$('name').addEventListener('input', () => { map.name = $('name').value.trim() || 'Untitled map'; changed(); });

// ---- maps: pick, new, delete, export, import, play
function fillPicker() {
  const p = $('pick'), list = loadMaps().sort((a, b) => (b.updated || 0) - (a.updated || 0)); p.innerHTML = '';
  for (const m of list) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.name; p.append(o); }
  if (map) p.value = map.id;
}
$('pick').onchange = e => { const m = loadMaps().find(x => x.id === e.target.value); if (m) openMap(m); };
function openMap(m) {
  map = m; B = THEATRES[m.base]; sel = null; drag = null; stroke = null; undo.length = 0; redo.length = 0;
  fillPanels(); fillPicker(); refreshButtons(); dirty = true; $('status').textContent = 'Saved';
  history.replaceState(null, '', '?map=' + m.id);
}
const nBase = $('nBase');
for (const k of Object.keys(THEATRES)) { const o = document.createElement('option'); o.value = k; o.textContent = THEATRES[k].title + ' · ' + THEATRES[k].place; nBase.append(o); }
$('bNew').onclick = () => { $('dlgNew').showModal(); $('nName').select(); };
$('dlgNew').addEventListener('close', () => {
  if ($('dlgNew').returnValue !== 'ok') { if (!map) $('dlgNew').showModal(); return; }
  const start = document.querySelector('input[name=nStart]:checked').value;
  const m = newMapFrom(nBase.value, $('nName').value.trim() || 'My battlefield', start);
  openMap(m); save();
});
$('bDelete').onclick = () => {
  if (!confirm(`Delete "${map.name}"? This cannot be undone.`)) return;
  saveMaps(loadMaps().filter(m => m.id !== map.id));
  try { if (localStorage.getItem(FRONT_KEY) === 'map-' + map.id) localStorage.removeItem(FRONT_KEY); } catch (e) { }
  const rest = loadMaps(); map = null;
  if (rest.length) openMap(rest[0]); else { fillPicker(); $('dlgNew').showModal(); }
};
$('bExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(map)], { type: 'application/json' }));
  a.download = (map.name.replace(/[^\w\- ]+/g, '').trim() || 'map') + '.frontline-map.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('bImport').onclick = () => $('file').click();
$('file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const m = validMap(JSON.parse(await f.text())); m.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); openMap(m); save(); }
  catch (err) { alert('That file is not a Frontline map: ' + err.message); }
};
$('bPlay').onclick = () => { save(); location.href = 'index.html?front=map-' + map.id; };
$('bUndo').onclick = doUndo; $('bRedo').onclick = doRedo;

// an imported file must have exactly the shape the game expects
function validMap(m) {
  const fail = s => { throw new Error(s); };
  const isLL = q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite);
  const str = (v, d) => typeof v === 'string' && v.trim() ? v.slice(0, 40) : d;
  if (!m || typeof m !== 'object') fail('not a map');
  if (!THEATRES[m.base]) fail('unknown base campaign');
  const T = THEATRES[m.base], o = newMapFrom(m.base, str(m.name, 'Imported map'), 'sea');
  o.coast = !!m.coast;
  if (!Array.isArray(m.stamps)) fail('no terrain');
  o.stamps = m.stamps.filter(s => Array.isArray(s) && STAMP_KINDS.includes(s[0]) && [s[1], s[2], s[3]].every(Number.isFinite)).map(s => [s[0], s[1], s[2], Math.max(1, Math.min(40000, s[3]))]);
  if (!Array.isArray(m.lanes) || m.lanes.length !== 3 || !m.lanes.every(l => Array.isArray(l) && l.length === 9 && l.every(isLL))) fail('capture points are missing');
  o.lanes = m.lanes;
  if (!Array.isArray(m.homeNodes) || m.homeNodes.length !== 5 || !m.homeNodes.every(isLL)) fail('homeland points are missing');
  o.homeNodes = m.homeNodes;
  for (const k of ['hq', 'airport']) { if (!Array.isArray(m[k]) || m[k].length !== 2 || !m[k].every(isLL)) fail('headquarters or airfields are missing'); o[k] = m[k]; }
  if (Array.isArray(m.home) && m.home.length === 2 && m.home.every(h => h && ['depot', 'airDepot', 'dockFrom', 'seaFar'].every(k => isLL(h[k]))))
    o.home = m.home.map((h, t) => Object.assign({}, T.home[t], { depot: h.depot, airDepot: h.airDepot, dockFrom: h.dockFrom, seaFar: h.seaFar }));
  if (Array.isArray(m.sectors) && m.sectors.length === 7) o.sectors = m.sectors.map((s, i) => str(s, o.sectors[i]));
  if (Array.isArray(m.pointNames) && m.pointNames.length === 7) o.pointNames = o.pointNames.map((r, c) => r.map((n, l) => str(m.pointNames[c] && m.pointNames[c][l], n)));
  o.homeName = str(m.homeName, o.homeName);
  if (Array.isArray(m.homeNames) && m.homeNames.length === 3) o.homeNames = m.homeNames.map((s, i) => str(s, o.homeNames[i]));
  return o;
}

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
  const n = +e.key; if (n >= 1 && n <= TOOLS.length) setTool(TOOLS[n - 1].id);
  if (e.key === '[') setBrush(brush * 0.85); if (e.key === ']') setBrush(brush * 1.15);
});

// ---- start: the map in the address bar, else the last one edited, else a new one
setBrush(260); setTool('land');
{
  const want = new URLSearchParams(location.search).get('map'), list = loadMaps().sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const m = list.find(x => x.id === want) || list[0];
  if (m) openMap(m); else { fillPicker(); $('dlgNew').showModal(); }
}
loop();

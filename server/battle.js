// One room's battle, in a worker thread of its own (started by server.js).
// It loads the same rules files the browser uses, then steps the battle 30 times a second and hands back a
// snapshot for each player every second step. Running each battle in its own thread keeps them at full speed
// and stops one room's work (or crash) from holding up the others.
'use strict';
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { root, front, map, tiers, owners } = workerData;

globalThis.FRONTLINE_FRONT = front; globalThis.FRONTLINE_MAP = map;
for (const f of ['js/vendor/three.min.js', 'js/mapdraw.js', 'js/theatres.js', 'js/defs.js', 'js/world.js', 'js/sim.js'])
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'room.js'), 'utf8'), { filename: 'server/room.js' });
const B = vm.runInThisContext('({ step, Net })');
B.Net.setup({ tiers, owners });

const TICK = 1 / 30, SNAP_EVERY = 2, clients = new Map();     // connection id -> player
let tick = 0, overSent = false;
parentPort.postMessage({ t: 'ready', front: B.Net.info().front });
parentPort.on('message', m => {
  if (m.t === 'join') {
    const pl = B.Net.join(m.name, m.tiers, 0); pl.host = !!m.host; clients.set(m.cid, pl);
    parentPort.postMessage({ t: 'joined', cid: m.cid, id: pl.id, team: pl.team, name: pl.name, host: pl.host, startOwned: B.Net.info().startOwned });
  } else if (m.t === 'leave') { const pl = clients.get(m.cid); if (pl) { B.Net.leave(pl); clients.delete(m.cid); } }
  else if (m.t === 'msg') { const pl = clients.get(m.cid); if (pl) try { B.Net.handle(pl, m.m); } catch (e) { console.error('bad message', e && e.message); } }
});
setInterval(() => {
  if (!clients.size) return;                                  // nobody here: the battle waits
  B.step(TICK);
  if (++tick % SNAP_EVERY) return;
  const shared = B.Net.shared(), out = [];
  for (const [cid, pl] of clients) out.push([cid, B.Net.packet(pl, shared)]);
  parentPort.postMessage({ t: 'packets', out });
  if (!overSent && B.Net.info().over) { overSent = true; parentPort.postMessage({ t: 'over' }); }
}, TICK * 1000);

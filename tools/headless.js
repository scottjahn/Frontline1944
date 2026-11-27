// Runs a whole battle with no browser: the same rules files the game loads, in plain Node.
// This is what a game server will do. Usage: node tools/headless.js [eu|pac|mod] [minutes]
//   node tools/headless.js pac 4
// It plays one battle with a computer "player" riding along in a vehicle and checks the rules keep working.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const front = process.argv[2] || 'eu', minutes = +(process.argv[3] || 6);

const ctx = vm.createContext({ console, Math, Date, FRONTLINE_FRONT: front });
for (const f of ['js/vendor/three.min.js', 'js/mapdraw.js', 'js/theatres.js', 'js/defs.js', 'js/world.js', 'js/sim.js'])
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);

const t0 = Date.now();
const result = run(`(() => {
  const log = { msgs: 0, tells: 0, fx: 0, kills: 0, over: undefined, caps: 0, seasons: 0, died: 0 };
  Out.msg = () => log.msgs++; Out.tell = () => log.tells++; Out.fx = () => log.fx++;
  Out.killed = () => log.kills++; Out.over = w => { log.over = w === undefined ? 'time' : w; };
  Out.season = () => log.seasons++; Out.died = () => log.died++;
  Out.banner = (team, title) => { if (/captured|retaken/.test(title)) log.caps++; };
  setupTeams();
  const startUnits = units.length;
  // a stand-in player: deploys in a tank at the front and drives forward with the gun held down
  const pl = addPlayer(ALLY, { name: 'Bot' });
  const col = POINTS.filter(p => !p.eng && p.owner === ALLY).reduce((c, p) => Math.max(c, p.col), 0);
  const ride = SHOP.Land.find(id => plHas(pl, id) && !NONCOMBAT[DEFS[id].role] && DEFS[id].gun);
  deployPlayer(pl, ride, col);
  const deployed = pl.unit && pl.unit.def.name;
  const dt = 1 / 30, steps = Math.round(${minutes} * 60 / dt);
  let respawns = 0;
  for (let i = 0; i < steps && !battleOver; i++) {
    const u = pl.unit;
    if (!u) { if (pl.deployCd <= 0) { deployPlayer(pl, ride, col); pl.deployCd = 20; respawns++; } }
    else {
      const t = units.find(e => e.team !== pl.team && e.def.domain !== 'bld' && e.pos.distanceTo(u.pos) < 600);
      pl.ctl.w = true; pl.ctl.yaw = u.yaw;
      if (t) pl.ctl.aimPoint.copy(t.pos); else pl.ctl.aimPoint.set(u.pos.x + Math.sin(u.yaw) * 100, u.pos.y, u.pos.z + Math.cos(u.yaw) * 100);
      pl.ctl.fire = !!t;
    }
    step(dt);
  }
  const bad = units.filter(u => !isFinite(u.pos.x) || !isFinite(u.pos.y) || !isFinite(u.pos.z)).length;
  return { theatre: TH.id, simulated: Math.round(time) + 's', startUnits, unitsNow: units.length, projectiles: projs.length,
    deployed, respawns, playerKills: pl.stats.kills, playerMoney: Math.round(pl.money), ...log, nonFiniteUnits: bad,
    owners: { allied: ownedBy(ALLY), axis: ownedBy(AXIS), open: POINTS.length - ownedBy(ALLY) - ownedBy(AXIS) } };
})()`);
result.wallTime = ((Date.now() - t0) / 1000).toFixed(1) + 's';
console.log(JSON.stringify(result, null, 2));
const ok = result.nonFiniteUnits === 0 && result.kills > 0 && result.fx > 0 && result.unitsNow > 20;
console.log(ok ? 'OK: the battle ran headless' : 'PROBLEM: see the numbers above');
process.exit(ok ? 0 : 1);

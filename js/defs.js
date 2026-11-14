'use strict';
// ---------- constants & unit definitions ----------
const ALLY = 0, AXIS = 1;
const TEAM_NAME = ['Allied', 'Axis'];
const TEAM_COL = [0x3a78ff, 0xd83030];
// The battlefield is north-west Europe, seen from above: x runs west to east, z north to south.
const MAP = { x: 7000, z: 3750 };
const EU = { lon0: -9, lon1: 17.7, lat0: 46.5, lat1: 55.5 };
// longitude / latitude -> battlefield coordinates
function LL(lon, lat) { return { x: Math.round(((lon - EU.lon0) / (EU.lon1 - EU.lon0) * 2 - 1) * MAP.x), z: Math.round(((EU.lat1 - lat) / (EU.lat1 - EU.lat0) * 2 - 1) * MAP.z) }; }
const BASE = [LL(-4.0, 50.72), LL(13.4, 52.5)];               // Allied HQ in Devon, Axis HQ at Berlin
const AIRPORT = [LL(-2.2, 51.0), LL(12.2, 52.0)];             // runway centre; runs east-west
// supply routes and harbours. dock / port are worked out from the coastline when the terrain is built.
const HOME = [
  { depot: LL(-2.6, 50.95), airDepot: LL(-1.5, 53.5), dockFrom: LL(-4.0, 50.72), dockDir: [0, 1], dockYaw: 0, seaFar: LL(-6.5, 49.3) },
  { depot: LL(13.4, 53.3), airDepot: LL(15.5, 51.0), dockFrom: LL(9.0, 54.6), dockDir: [-1, 0], dockYaw: -Math.PI / 2, seaFar: LL(6.6, 55.1) }
];
const EU_LAND = [
  // Great Britain
  [[-5.7, 50.05], [-4.2, 50.35], [-3.4, 50.6], [-2, 50.6], [-1.1, 50.75], [0.3, 50.75], [1.2, 51.2], [1, 51.4], [0.6, 51.5], [1.6, 52], [1.75, 52.7], [0.4, 52.95], [0.1, 53.5], [-0.1, 54], [-0.6, 54.5], [-1.4, 55], [-1.6, 55.6], [-2.1, 56], [-3, 56], [-2.5, 56.5], [-2, 57.6], [-3.5, 57.7], [-3, 58.6], [-5, 58.6], [-5.8, 57.5], [-5.6, 56.3], [-5, 55.3], [-4.9, 54.7], [-3.4, 54.9], [-3, 54], [-3.1, 53.3], [-4.5, 53.3], [-4.2, 52.8], [-4.1, 52.3], [-5.2, 51.9], [-4.9, 51.6], [-3.2, 51.4], [-3, 51.2], [-4.3, 51.15], [-5.2, 50.35]],
  // Ireland
  [[-6, 52.2], [-6.2, 53.3], [-5.5, 54.4], [-6.3, 55.2], [-7.8, 55.3], [-8.6, 54.5], [-10, 54.2], [-9.5, 53.3], [-10.3, 52], [-9.6, 51.5], [-8, 51.8], [-6.9, 52.1]],
  // the Continent, Spain round to the Baltic
  [[-9.3, 43], [-8, 43.75], [-5.8, 43.6], [-3.8, 43.45], [-1.8, 43.35], [-1.2, 44.6], [-1.1, 45.6], [-1.2, 46.2], [-2.1, 46.8], [-2.5, 47.3], [-3.5, 47.75], [-4.4, 47.95], [-4.75, 48.3], [-4.5, 48.6], [-3.6, 48.75], [-2.7, 48.55], [-1.9, 48.65], [-1.55, 48.65], [-1.6, 49.2], [-1.85, 49.7], [-1.3, 49.7], [-1.1, 49.35], [-0.3, 49.3], [0.1, 49.5], [0.7, 49.87], [1.5, 50.1], [1.6, 50.75], [1.85, 50.96], [2.5, 51.1], [3.2, 51.35], [3.5, 51.45], [4, 51.95], [4.5, 52.4], [4.7, 52.95], [5.4, 53.25], [6.2, 53.45], [7.1, 53.55], [8, 53.6], [8.5, 53.55], [8.6, 53.9], [8.9, 54.3], [8.6, 55], [8.1, 55.6], [8.1, 56.6], [8.6, 57.1], [9.9, 57.6], [10.6, 57.7], [10.3, 56.9], [10.9, 56.4], [10.2, 55.8], [9.7, 55.2], [10, 54.7], [10.9, 54.35], [11.1, 54], [12.1, 54.15], [13, 54.45], [13.8, 54.1], [14.3, 53.9], [16, 54.25], [18, 54.8], [20, 54.4], [20, 42], [-9.3, 42]],
  // Zealand and southern Sweden
  [[11, 55.7], [12.5, 55.6], [12.6, 56.1], [11.6, 55.95]],
  [[12.8, 56], [12.9, 55.4], [14.2, 55.4], [14.4, 56], [16.5, 57], [16, 60], [11.3, 59], [11.8, 57.6]]
];
// [lon, lat] for each lane: index 0 = Allied home, 1..7 = the sectors west to east, 8 = Axis home
const EU_LANES = [
  [[-3.9, 48.15], [-3.2, 48.05], [-1.2, 48.4], [0.1, 48.5], [1.8, 48.7], [2.9, 50], [5.2, 50.4], [9.3, 52], [12.6, 51.6]],
  [[-4.55, 48.4], [-4.15, 48.42], [-1.45, 49.45], [-0.37, 49.1], [1.1, 49.44], [1.95, 50.8], [4.4, 51.22], [8.8, 53.08], [12.7, 52.5]],
  [[-4.3, 49.9], [-5.3, 49], [-2.2, 50.15], [-0.6, 49.95], [0.5, 50.3], [1.9, 51.5], [3.1, 52.1], [6.8, 54.1], [8.0, 54.55]]
];

// ---- campaign: seven sectors along the coast from Brittany to Germany, each with three capture points:
// lane 0 inland, lane 1 the coast town, lane 2 out at sea. NODE holds each lane's chain of places in battlefield coordinates.
const SECTORS = ['Brest', 'Cherbourg', 'Caen', 'Rouen', 'Calais', 'Antwerp', 'Bremen'];
const COLS = SECTORS.length, LANES = 3, SEA_LANE = 2;
const LANE = [{ tag: ' Heights' }, { tag: '' }, { tag: ' Roads' }];
const NODE = EU_LANES.map(l => l.map(q => LL(q[0], q[1])));
const POINTS = [];
for (let c = 0; c < COLS; c++) for (let l = 0; l < LANES; l++)
  POINTS.push({ i: POINTS.length, col: c, lane: l, sea: l === SEA_LANE, name: SECTORS[c] + LANE[l].tag,
    x: NODE[l][c + 1].x, z: NODE[l][c + 1].z, owner: c < 3 ? 0 : c > 3 ? 1 : -1, prog: 0, post: null, rubble: null });
// ---- England: three more points on the road from the Channel ports to the Allied headquarters. They form a
// lane of their own (lane 3). While the Axis hold Calais they can ferry ground forces across to Dover.
const ENG_LANE = 3, ENG_NAMES = ['Southampton', 'London', 'Dover'];
NODE.push([LL(-3.6, 50.75), LL(-1.2, 50.95), LL(-0.1, 51.5), LL(0.75, 51.22), LL(1.95, 50.8)]);
const ENG = ENG_NAMES.map((name, c) => ({ i: POINTS.length + c, col: c, lane: ENG_LANE, eng: true, sea: false, name,
  x: NODE[ENG_LANE][c + 1].x, z: NODE[ENG_LANE][c + 1].z, owner: 0, prog: 0, post: null, rubble: null }));
POINTS.push(...ENG);
function secOf(p) { return p.eng ? -1 : p.col; }             // sector a point belongs to: -1 is England
function secName(c) { return c < 0 ? 'England' : SECTORS[c]; }
function PT(col, lane) { return POINTS[col * LANES + lane]; }
const CAP_R = 230, CAP_R_SEA = 330;
const BATTLE_LEN = 720;                 // one battle (operation) lasts twelve minutes
// permanent unlock tiers, per branch: price in credits to open tier N
const TIER_PRICE = [0, 0, 1500, 4000, 9000, 18000];
const MAX_TIER = 5;
const DEFS = {};

function def(id, o) { o.id = id; DEFS[id] = o; return o; }
function mirror(id, base, name, extra) {
  return def(id, Object.assign({}, DEFS[base], { name, team: AXIS }, extra || {}));
}
// tier   = the permanent unlock tier (per branch: air / land / sea) the vehicle belongs to
// cost   = war-chest price of an extra computer-controlled escort (your own vehicle is free once its tier is unlocked)
// aiCost = what computer commanders pay (also sets the bounty)

// ---- AIR ----
def('spitfire', { tier: 1, name: 'Spitfire', team: ALLY, domain: 'air', role: 'fighter', model: 'fighter', cost: 250, aiCost: 220,
  hp: 110, speed: 115, turn: 1.5, radius: 7, crew: 1, camDist: 34, camH: 7, gear: 1.4, desc: 'Nimble fighter. Guns + one bomb.',
  gun: { kind: 'bullet', dmg: 7, rate: 0.09, range: 520, vel: 650, spread: 0.012 },
  alt: { kind: 'bomb', dmg: 140, splash: 30, count: 1, cd: 7, label: 'Bomb' } });
def('mustang', { tier: 2, name: 'P-51 Mustang', team: ALLY, domain: 'air', role: 'fighter', model: 'fighter', cost: 800, aiCost: 450,
  hp: 170, speed: 138, turn: 1.75, radius: 7, crew: 1, camDist: 34, camH: 7, gear: 1.4, desc: 'Faster, tougher fighter. Two bombs.',
  gun: { kind: 'bullet', dmg: 10, rate: 0.08, range: 560, vel: 700, spread: 0.01 },
  alt: { kind: 'bomb', dmg: 160, splash: 32, count: 2, cd: 7, label: 'Bombs' } });
def('p38', { tier: 3, name: 'P-38 Lightning', team: ALLY, domain: 'air', role: 'fighter', model: 'fighter', twin: 1, big: 1.2, cost: 1300, aiCost: 700,
  hp: 270, speed: 146, turn: 1.45, radius: 8, crew: 1, camDist: 38, camH: 8, gear: 1.7, desc: 'Twin-engine heavy fighter. Nose cannons, three bombs.',
  gun: { kind: 'bullet', dmg: 15, rate: 0.07, range: 600, vel: 720, spread: 0.008 },
  alt: { kind: 'bomb', dmg: 180, splash: 32, count: 3, cd: 7, label: 'Bombs' } });
def('avenger', { tier: 2, name: 'TBF Avenger', team: ALLY, domain: 'air', role: 'torpedo', model: 'fighter', big: 1.3, cost: 700, aiCost: 400,
  hp: 160, speed: 98, turn: 1.1, radius: 8, crew: 3, camDist: 38, camH: 8, gear: 1.8, desc: 'Torpedo bomber. Ship killer.',
  gun: { kind: 'bullet', dmg: 6, rate: 0.12, range: 450, vel: 600, spread: 0.015 },
  alt: { kind: 'torpedo', dmg: 420, splash: 12, cd: 10, label: 'Torpedo' } });
def('r4', { tier: 3, name: 'R-4 Hoverfly', team: ALLY, domain: 'air', heli: 1, role: 'heli', model: 'heli', cost: 900, aiCost: 450, max: 2,
  hp: 230, speed: 55, turn: 2.4, radius: 6, crew: 2, camDist: 30, camH: 8, desc: 'Helicopter. Hovers, strafes, fires rockets at anything below.',
  gun: { kind: 'bullet', dmg: 8, rate: 0.07, range: 460, vel: 650, spread: 0.014 },
  alt: { kind: 'shell', dmg: 95, splash: 13, cd: 2.5, vel: 280, range: 520, label: 'Rockets' } });
def('b25', { tier: 3, name: 'B-25 Mitchell', team: ALLY, domain: 'air', role: 'bomber', model: 'bomber', big: 0.72, engines: 2, cost: 1600, aiCost: 800,
  hp: 380, speed: 112, turn: 0.9, radius: 10, crew: 6, camDist: 48, camH: 11, gear: 1.9, desc: 'Medium bomber. Four bombs, fast turnaround.',
  gun: { kind: 'bullet', dmg: 8, rate: 0.09, range: 500, vel: 640, spread: 0.018 },
  alt: { kind: 'bomb', dmg: 180, splash: 32, count: 4, cd: 8, label: 'Bomb stick' },
  aa: { dmg: 4, rate: 0.2, range: 300 } });
def('b17', { tier: 4, name: 'B-17 Flying Fortress', team: ALLY, domain: 'air', role: 'bomber', model: 'bomber', cost: 2800, aiCost: 1400,
  hp: 650, speed: 96, turn: 0.7, radius: 14, crew: 10, camDist: 62, camH: 14, gear: 2.4, desc: 'Heavy bomber with defensive gunners.',
  gun: { kind: 'bullet', dmg: 7, rate: 0.1, range: 480, vel: 620, spread: 0.02 },
  alt: { kind: 'bomb', dmg: 190, splash: 34, count: 6, cd: 9, label: 'Bomb stick' },
  aa: { dmg: 5, rate: 0.16, range: 340 } });
def('b24', { tier: 5, name: 'B-24 Superfortress', team: ALLY, domain: 'air', role: 'bomber', model: 'bomber', big: 1.18, silver: 1, cost: 8000,
  hp: 1100, speed: 128, turn: 0.65, radius: 16, crew: 11, camDist: 76, camH: 17, gear: 2.8, desc: 'Carries THE atomic bomb. One drop obliterates everything beneath it.',
  gun: { kind: 'bullet', dmg: 9, rate: 0.09, range: 520, vel: 660, spread: 0.018 },
  alt: { kind: 'nuke', dmg: 9000, splash: 340, count: 1, cd: 60, label: 'Atomic bomb' },
  aa: { dmg: 7, rate: 0.13, range: 400 } });
def('b52', { tier: 5, name: 'B-52 Stratofortress', team: ALLY, domain: 'air', role: 'bomber', model: 'b52', cost: 10000,
  hp: 2400, speed: 165, turn: 0.6, radius: 24, crew: 6, camDist: 115, camH: 24, gear: 3.6, desc: 'THE best plane. 24-bomb carpet. Nearly unstoppable.',
  gun: { kind: 'bullet', dmg: 12, rate: 0.06, range: 600, vel: 750, spread: 0.015 },
  alt: { kind: 'bomb', dmg: 340, splash: 50, count: 24, cd: 10, label: 'Carpet bomb' },
  aa: { dmg: 10, rate: 0.1, range: 460 } });
def('c47', { tier: 1, name: 'C-47 Skytrain', team: ALLY, domain: 'air', role: 'cargo', model: 'bomber', big: 0.7, engines: 2, cargoLook: 1, cost: 350, aiCost: 300, max: 2, pay: 150,
  hp: 260, speed: 88, turn: 0.8, radius: 10, crew: 4, camDist: 48, camH: 11, gear: 1.9, desc: 'Cargo plane. Flies supply runs and pays cash on every return.' });
def('c54', { tier: 1, name: 'C-54 Skymaster', team: ALLY, domain: 'air', role: 'airlift', model: 'bomber', big: 0.9, cargoLook: 1, cost: 0, aiCost: 400,
  hp: 420, speed: 100, turn: 0.75, radius: 13, crew: 5, camDist: 58, camH: 13, gear: 2.2, desc: 'Military transport. Parachutes ground reinforcements in.' });

// ---- LAND ----
def('troops', { tier: 1, name: 'Troop Squadron', team: ALLY, domain: 'land', role: 'infantry', model: 'squad', cost: 200, aiCost: 180,
  hp: 150, speed: 14, turn: 2.6, radius: 6, crew: 8, camDist: 20, camH: 6, centerY: 1.2, desc: 'Eight riflemen with a bazooka.',
  gun: { kind: 'bullet', dmg: 5, rate: 0.11, range: 290, vel: 520, spread: 0.03 },
  alt: { kind: 'shell', dmg: 95, splash: 12, cd: 5, vel: 220, range: 320, label: 'Bazooka' } });
def('jeep', { tier: 2, name: 'Willys Jeep', team: ALLY, domain: 'land', role: 'infantry', model: 'jeep', cost: 300, aiCost: 200,
  hp: 150, speed: 36, turn: 1.9, radius: 4, crew: 3, camDist: 18, camH: 6, centerY: 1.2, desc: 'Very fast scout car with a .50 cal.',
  gun: { kind: 'bullet', dmg: 8, rate: 0.08, range: 380, vel: 620, spread: 0.02 } });
def('halftrack', { tier: 2, name: 'M16 Half-track', team: ALLY, domain: 'land', role: 'aa', model: 'halftrack', cost: 600, aiCost: 350,
  hp: 260, speed: 25, turn: 1.6, radius: 6, crew: 5, camDist: 22, camH: 7, centerY: 1.5, armor: 1, desc: 'Quad .50 cal. Shreds aircraft.',
  gun: { kind: 'bullet', dmg: 8, rate: 0.05, range: 480, vel: 700, spread: 0.02 } });
def('sherman', { tier: 3, name: 'M4 Sherman', team: ALLY, domain: 'land', role: 'tank', model: 'tank', cost: 800, aiCost: 400,
  hp: 440, speed: 21, turn: 1.2, radius: 6, crew: 5, camDist: 24, camH: 8, centerY: 1.5, armor: 1, desc: 'Medium tank. 75mm cannon.',
  gun: { kind: 'shell', dmg: 85, splash: 10, rate: 2.0, range: 430, vel: 330 } });
def('priest', { tier: 4, name: 'M7 Priest', team: ALLY, domain: 'land', role: 'tank', model: 'tank', big: 1.12, spg: 1, cost: 1200, aiCost: 650,
  hp: 380, speed: 18, turn: 1.0, radius: 6, crew: 7, camDist: 26, camH: 9, centerY: 1.6, armor: 1, desc: 'Self-propelled artillery. Huge range and blast, slow to reload.',
  gun: { kind: 'shell', dmg: 170, splash: 22, rate: 4.0, range: 760, vel: 320 } });
def('pershing', { tier: 5, name: 'M26 Pershing', team: ALLY, domain: 'land', role: 'tank', model: 'tank', big: 1.3, cost: 1800, aiCost: 1000,
  hp: 900, speed: 19, turn: 1.0, radius: 7, crew: 5, camDist: 28, camH: 9, centerY: 1.8, armor: 1, desc: 'Heavy tank. 90mm cannon.',
  gun: { kind: 'shell', dmg: 150, splash: 13, rate: 2.3, range: 480, vel: 360 } });
def('truck', { tier: 1, name: 'Supply Truck', team: ALLY, domain: 'land', role: 'cargo', model: 'truck', cost: 150, aiCost: 150, max: 3, pay: 90,
  hp: 140, speed: 27, turn: 1.5, radius: 5, crew: 2, camDist: 20, camH: 7, centerY: 1.5, desc: 'Transport truck. Hauls supplies by road and pays on every delivery.' });

// ---- SEA ----
def('ward', { tier: 1, name: 'USS Ward', team: ALLY, domain: 'sea', role: 'warship', model: 'ship', cost: 600, aiCost: 500, asw: 1,
  hp: 720, speed: 25, turn: 0.55, radius: 8, len: 50, beam: 7, crew: 120, camDist: 70, camH: 22, centerY: 3, armor: 1,
  turrets: [1, 1], funnels: 2, desc: 'Destroyer. Guns, torpedoes, AA, depth charges.',
  gun: { kind: 'shell', dmg: 55, splash: 10, rate: 1.1, range: 580, vel: 400 },
  alt: { kind: 'torpedo', dmg: 380, splash: 12, cd: 8, label: 'Torpedo' },
  aa: { dmg: 4, rate: 0.2, range: 320 } });
def('pt', { tier: 2, name: 'PT Boat', team: ALLY, domain: 'sea', role: 'warship', model: 'ship', cost: 500, aiCost: 300, asw: 1,
  hp: 260, speed: 46, turn: 1.0, radius: 5, len: 26, beam: 6, crew: 14, camDist: 46, camH: 14, centerY: 2,
  turrets: [1, 0], funnels: 1, desc: 'Tiny, very fast torpedo boat. Depth charges too.',
  gun: { kind: 'bullet', dmg: 8, rate: 0.07, range: 430, vel: 640, spread: 0.02 },
  alt: { kind: 'torpedo', dmg: 380, splash: 12, cd: 6, label: 'Torpedo' } });
def('gato', { tier: 3, name: 'USS Gato', team: ALLY, domain: 'sea', role: 'sub', model: 'sub', sub: 1, diveDepth: 7.5, cost: 1100, aiCost: 600, max: 2,
  hp: 520, speed: 21, turn: 0.5, radius: 5, len: 52, beam: 6, crew: 60, camDist: 64, camH: 18, centerY: 1, armor: 1,
  desc: 'Submarine. Dive (C) to vanish from guns; hunts with torpedoes.',
  gun: { kind: 'shell', dmg: 45, splash: 8, rate: 1.6, range: 480, vel: 380 },
  alt: { kind: 'torpedo', dmg: 440, splash: 12, cd: 5, label: 'Torpedo' } });
def('atlanta', { tier: 3, name: 'USS Atlanta', team: ALLY, domain: 'sea', role: 'warship', model: 'ship', cost: 2600, aiCost: 1600, asw: 1,
  hp: 1800, speed: 22, turn: 0.42, radius: 11, len: 78, beam: 10, crew: 600, camDist: 100, camH: 30, centerY: 4, armor: 1,
  turrets: [2, 1], funnels: 2, desc: 'Cruiser. Heavy AA screen.',
  gun: { kind: 'shell', dmg: 85, splash: 13, rate: 0.8, range: 700, vel: 430 },
  alt: { kind: 'torpedo', dmg: 400, splash: 12, cd: 9, label: 'Torpedo' },
  aa: { dmg: 7, rate: 0.1, range: 420 } });
def('iowa', { tier: 5, name: 'USS Iowa', team: ALLY, domain: 'sea', role: 'warship', model: 'ship', cost: 5000, aiCost: 4200, max: 1,
  hp: 4800, speed: 19, turn: 0.3, radius: 15, len: 112, beam: 14, crew: 1900, camDist: 140, camH: 42, centerY: 5, armor: 1,
  turrets: [2, 1], funnels: 2, desc: 'Battleship. 16-inch guns.',
  gun: { kind: 'shell', dmg: 270, splash: 24, rate: 2.4, range: 950, vel: 460 },
  aa: { dmg: 8, rate: 0.08, range: 450 } });
def('arizona', { tier: 5, name: 'USS Arizona', team: ALLY, domain: 'sea', role: 'warship', model: 'ship', cost: 7500,
  hp: 7000, speed: 18, turn: 0.28, radius: 17, len: 128, beam: 16, crew: 2300, camDist: 160, camH: 48, centerY: 6, armor: 1,
  turrets: [2, 2], funnels: 2, desc: 'THE top battleship. Four turrets of 14-inch guns and a wall of AA.',
  gun: { kind: 'shell', dmg: 340, splash: 28, rate: 1.9, range: 1050, vel: 480 },
  aa: { dmg: 10, rate: 0.07, range: 480 } });
def('essex', { tier: 4, name: 'USS Essex', team: ALLY, domain: 'sea', role: 'carrier', model: 'carrier', cost: 3200, aiCost: 2400, max: 1,
  hp: 3400, speed: 20, turn: 0.3, radius: 17, len: 136, beam: 19, crew: 2600, camDist: 170, camH: 52, centerY: 7, armor: 1,
  desc: 'Aircraft carrier. Launches fighter flights from her deck (Space) and lets you take off far from home.',
  gun: { kind: 'shell', dmg: 50, splash: 10, rate: 0.9, range: 620, vel: 420 },
  alt: { kind: 'launch', cd: 28, label: 'Launch fighters' },
  aa: { dmg: 9, rate: 0.07, range: 480 } });
def('liberty', { tier: 1, name: 'Liberty Ship', team: ALLY, domain: 'sea', role: 'merchant', model: 'merchant', cost: 300, aiCost: 300, max: 3, pay: 400,
  hp: 460, speed: 14, turn: 0.4, radius: 9, len: 56, beam: 9, crew: 40, camDist: 80, camH: 24, centerY: 3, armor: 1,
  desc: 'Merchant vessel. Pays cash every delivery.' });
def('lst', { tier: 1, name: 'LST Landing Ship', team: ALLY, domain: 'sea', role: 'lander', model: 'merchant', mil: 1, cost: 1800, aiCost: 0,
  cargo: ['sherman', 'sherman', 'halftrack', 'troops'],
  hp: 800, speed: 17, turn: 0.4, radius: 9, len: 60, beam: 10, crew: 110, camDist: 80, camH: 24, centerY: 3, armor: 1,
  desc: 'Military cargo ship. Lands two Shermans, a half-track and a rifle squad on the beach.' });

// ---- AXIS mirrors ----
mirror('bf109', 'spitfire', 'Bf 109');
mirror('fw190', 'mustang', 'Fw 190');
mirror('bf110', 'p38', 'Bf 110');
mirror('fi167', 'avenger', 'Fi 167');
mirror('fa223', 'r4', 'Fa 223 Drache');
mirror('ju88', 'b25', 'Ju 88');
mirror('he111', 'b17', 'He 111');
mirror('ju52', 'c47', 'Ju 52');
mirror('me323', 'c54', 'Me 323 Gigant');
mirror('grenadier', 'troops', 'Grenadier Squad');
mirror('kubel', 'jeep', 'Kübelwagen');
mirror('flakwagen', 'halftrack', 'Sd.Kfz. 7 Flak');
mirror('panzer4', 'sherman', 'Panzer IV');
mirror('wespe', 'priest', 'Wespe');
mirror('tiger', 'pershing', 'Tiger I');
mirror('opel', 'truck', 'Opel Blitz');
mirror('z23', 'ward', 'Z-23 Destroyer');
mirror('sboot', 'pt', 'S-Boot');
mirror('uboat', 'gato', 'U-Boat Type VII');
mirror('hipper', 'atlanta', 'Admiral Hipper');
mirror('bismarck', 'iowa', 'Bismarck');
mirror('zeppelin', 'essex', 'Graf Zeppelin');
mirror('tirpitz', 'arizona', 'Tirpitz', { aiCost: 5200, max: 1 });
mirror('me264', 'b52', 'Me 264 Amerika', { aiCost: 3200, max: 1, hp: 1500, alt: { kind: 'bomb', dmg: 300, splash: 46, count: 12, cd: 12, label: 'Carpet bomb' } });
mirror('freighter', 'liberty', 'Axis Freighter');
mirror('mfp', 'lst', 'Marinefährprahm', { cargo: ['panzer4', 'panzer4', 'flakwagen', 'grenadier'] });

// ---- BUILDINGS (shared by both teams) ----
def('hq', { name: 'Headquarters', domain: 'bld', model: 'hq', cost: 0, hp: 6000, radius: 16, centerY: 6, armor: 1, people: 10, job: 'staff', perHead: 0 });
def('house', { name: 'House', domain: 'bld', model: 'house', cost: 150, hp: 260, radius: 8, centerY: 3, armor: 1,
  people: 5, job: 'residents', perHead: 2, desc: 'Five residents pay their bills to you.' });
def('factory', { name: 'Factory', domain: 'bld', model: 'factory', cost: 500, hp: 750, radius: 13, centerY: 5, armor: 1,
  people: 12, job: 'workers', perHead: 3, desc: 'Twelve workers churn out war profits.' });
def('aagun', { name: 'AA Battery', domain: 'bld', model: 'aagun', cost: 300, hp: 420, radius: 6, centerY: 2, armor: 1,
  people: 3, job: 'gunners', perHead: 0, desc: 'Three gunners defend the base from aircraft.',
  aa: { dmg: 8, rate: 0.12, range: 520 } });
def('outpost', { name: 'Command Post', domain: 'bld', model: 'outpost', cost: 0, aiCost: 1200, hp: 1500, radius: 11, centerY: 4, armor: 1,
  people: 4, job: 'gunners', perHead: 5, aa: { dmg: 6, rate: 0.16, range: 420 } });
def('seafort', { name: 'Sea Fort', domain: 'bld', model: 'seafort', cost: 0, aiCost: 1200, hp: 1800, radius: 12, centerY: 9, armor: 1,
  people: 0, job: 'gunners', perHead: 0, aa: { dmg: 7, rate: 0.14, range: 440 } });
def('dock', { name: 'Dock', domain: 'bld', model: 'dock', cost: 0, hp: 900, radius: 14, centerY: 2, armor: 1, people: 6, job: 'workers', perHead: 2 });
def('airport', { name: 'Airport', domain: 'bld', model: 'airport', cost: 0, aiCost: 1500, hp: 3500, radius: 17, centerY: 7, armor: 1, people: 8, job: 'ground crew', perHead: 0 });

// what the computer commanders may field; both sides are limited to the tiers the player has unlocked
const ROSTER = [
  ['spitfire', 'spitfire', 'mustang', 'p38', 'avenger', 'r4', 'b25', 'b17', 'c47', 'troops', 'troops', 'jeep', 'halftrack', 'sherman', 'sherman', 'priest', 'pershing', 'truck',
    'ward', 'ward', 'pt', 'gato', 'atlanta', 'essex', 'iowa', 'liberty'],
  ['bf109', 'bf109', 'fw190', 'bf110', 'fi167', 'fa223', 'ju88', 'he111', 'me264', 'ju52', 'grenadier', 'grenadier', 'kubel', 'flakwagen', 'panzer4', 'panzer4', 'wespe', 'tiger', 'opel',
    'z23', 'z23', 'sboot', 'uboat', 'hipper', 'zeppelin', 'bismarck', 'tirpitz', 'freighter']
];
const SHOP = {
  Air: ['c47', 'spitfire', 'mustang', 'avenger', 'r4', 'p38', 'b25', 'b17', 'b24', 'b52'],
  Land: ['truck', 'troops', 'jeep', 'halftrack', 'sherman', 'priest', 'pershing'],
  Sea: ['liberty', 'lst', 'ward', 'pt', 'gato', 'atlanta', 'essex', 'iowa', 'arizona'],
  Buildings: ['house', 'factory', 'aagun']
};
const BRANCH = { air: 'Air', land: 'Land', sea: 'Sea' };
const NONCOMBAT = { merchant: 1, cargo: 1, airlift: 1, lander: 1 };
const INCOME_PERIOD = 5;
const UNIT_CAP = 40;

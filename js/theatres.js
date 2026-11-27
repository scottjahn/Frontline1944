'use strict';
// ---------- theatres of war ----------
// Each theatre is one edition of the campaign: its own map, chain of sectors, home bases, seasons and unit names.
// Everything here is in longitude / latitude (east-positive; the Pacific uses 0..360 so it does not wrap at the
// date line). defs.js turns it into battlefield coordinates. Pick one with ?front=eu|pac|mod or from the menu.
const ALLY = 0, AXIS = 1;
const FRONT_KEY = 'frontline1944.front';

// an irregular island outline: centre, half-length along its long axis, half-width, heading of the long axis, seed
function islandBlob(c, rx, ry, rot, seed) {
  let a = seed * 9301 + 49297; const R = () => (a = (a * 9301 + 49297) % 233280) / 233280;
  const n = 18, out = [], cr = Math.cos(rot), sr = Math.sin(rot), ph = R() * 6.28;
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2, k = 0.86 + 0.16 * Math.sin(t * 3 + ph) + 0.1 * R();
    const x = Math.cos(t) * rx * k, y = Math.sin(t) * ry * k;
    out.push([c[0] + x * cr - y * sr, c[1] + x * sr + y * cr]);
  }
  return out;
}

const EU_SEASONS = [
  { name: 'Summer', icon: '☀', desc: 'Heat wave: the sea is rising', sky: 0x8ec9f0, fog: 0.00028, water: 3.5, tint: [0.80, 0.74, 0.40], tk: 0.18, light: 1.1, tree: 0x2f6b2a, vis: 1, reload: 1, wx: 'heat' },
  { name: 'Fall', icon: '🍂', desc: 'Thick fog: hard to see anything', sky: 0xb5b2a8, fog: 0.0042, water: 0, tint: [0.70, 0.42, 0.14], tk: 0.45, light: 0.75, tree: 0xb8621b, vis: 0.33, reload: 1, wx: 'fog' },
  { name: 'Winter', icon: '❄', desc: 'Ice: icebergs drift in the shipping lanes', sky: 0xcfdde8, fog: 0.0008, water: -0.4, tint: [0.95, 0.96, 1.0], tk: 0.88, light: 0.95, tree: 0xe8eef2, vis: 0.9, reload: 1, wx: 'snow', ice: 1, snow: 1 },
  { name: 'Rainy Season', icon: '🌧', desc: 'Downpour: crews are miserable and slow', sky: 0x5f6b75, fog: 0.0017, water: 1.2, tint: [0.18, 0.46, 0.2], tk: 0.3, light: 0.6, tree: 0x2c7a34, vis: 0.7, reload: 1.35, wx: 'rain', rain: 1 }
];
const PAC_SEASONS = [
  { name: 'Dry Season', icon: '☀', desc: 'Scorching sun: the sea is rising', sky: 0x7cc6f2, fog: 0.00022, water: 3.5, tint: [0.86, 0.78, 0.46], tk: 0.16, light: 1.15, tree: 0x2f7a2a, vis: 1, reload: 1, wx: 'heat' },
  { name: 'Sea Fog', icon: '🌫', desc: 'Thick sea fog: hard to see anything', sky: 0xaab4b0, fog: 0.0042, water: 0, tint: [0.40, 0.55, 0.34], tk: 0.2, light: 0.75, tree: 0x2c6a30, vis: 0.33, reload: 1, wx: 'fog' },
  { name: 'Typhoon', icon: '🌀', desc: 'Typhoon: wind, low cloud and heavy seas', sky: 0x6c7880, fog: 0.0012, water: 2.2, tint: [0.22, 0.42, 0.26], tk: 0.25, light: 0.65, tree: 0x255f2c, vis: 0.6, reload: 1.2, wx: 'rain', rain: 1 },
  { name: 'Monsoon', icon: '🌧', desc: 'Downpour: crews are miserable and slow', sky: 0x5f6b75, fog: 0.0017, water: 1.2, tint: [0.18, 0.5, 0.22], tk: 0.3, light: 0.6, tree: 0x2c7a34, vis: 0.7, reload: 1.35, wx: 'rain', rain: 1 }
];

// ---------------------------------------------------------------- Western Front: north-west Europe
const EU_THEATRE = {
  id: 'eu', title: 'Western Front', place: 'Europe', blurb: 'From England across the Channel to Berlin',
  box: { lon0: -9, lon1: 17.7, lat0: 46.5, lat1: 55.5 },
  face: [1, -1],               // which way (along x) each side faces the enemy: the Allies look east
  base: [[-4.0, 50.72], [13.4, 52.5]],       // Allied HQ in Devon, Axis HQ at Berlin
  airport: [[-2.2, 51.0], [12.2, 52.0]],
  home: [
    { depot: [-2.6, 50.95], airDepot: [-1.5, 53.5], dockFrom: [-4.0, 50.72], dockDir: [0, 1], dockYaw: 0, seaFar: [-6.5, 49.3] },
    { depot: [13.4, 53.3], airDepot: [15.5, 51.0], dockFrom: [9.0, 54.6], dockDir: [-1, 0], dockYaw: -Math.PI / 2, seaFar: [6.6, 55.1] }
  ],
  land: [
    // Great Britain
    [[-5.7, 50.05], [-4.2, 50.35], [-3.4, 50.6], [-2, 50.6], [-1.1, 50.75], [0.3, 50.75], [1.2, 51.2], [1, 51.4], [0.6, 51.5], [1.6, 52], [1.75, 52.7], [0.4, 52.95], [0.1, 53.5], [-0.1, 54], [-0.6, 54.5], [-1.4, 55], [-1.6, 55.6], [-2.1, 56], [-3, 56], [-2.5, 56.5], [-2, 57.6], [-3.5, 57.7], [-3, 58.6], [-5, 58.6], [-5.8, 57.5], [-5.6, 56.3], [-5, 55.3], [-4.9, 54.7], [-3.4, 54.9], [-3, 54], [-3.1, 53.3], [-4.5, 53.3], [-4.2, 52.8], [-4.1, 52.3], [-5.2, 51.9], [-4.9, 51.6], [-3.2, 51.4], [-3, 51.2], [-4.3, 51.15], [-5.2, 50.35]],
    // Ireland
    [[-6, 52.2], [-6.2, 53.3], [-5.5, 54.4], [-6.3, 55.2], [-7.8, 55.3], [-8.6, 54.5], [-10, 54.2], [-9.5, 53.3], [-10.3, 52], [-9.6, 51.5], [-8, 51.8], [-6.9, 52.1]],
    // the Continent, Spain round to the Baltic
    [[-9.3, 43], [-8, 43.75], [-5.8, 43.6], [-3.8, 43.45], [-1.8, 43.35], [-1.2, 44.6], [-1.1, 45.6], [-1.2, 46.2], [-2.1, 46.8], [-2.5, 47.3], [-3.5, 47.75], [-4.4, 47.95], [-4.75, 48.3], [-4.5, 48.6], [-3.6, 48.75], [-2.7, 48.55], [-1.9, 48.65], [-1.55, 48.65], [-1.6, 49.2], [-1.85, 49.7], [-1.3, 49.7], [-1.1, 49.35], [-0.3, 49.3], [0.1, 49.5], [0.7, 49.87], [1.5, 50.1], [1.6, 50.75], [1.85, 50.96], [2.5, 51.1], [3.2, 51.35], [3.5, 51.45], [4, 51.95], [4.5, 52.4], [4.7, 52.95], [5.4, 53.25], [6.2, 53.45], [7.1, 53.55], [8, 53.6], [8.5, 53.55], [8.6, 53.9], [8.9, 54.3], [8.6, 55], [8.1, 55.6], [8.1, 56.6], [8.6, 57.1], [9.9, 57.6], [10.6, 57.7], [10.3, 56.9], [10.9, 56.4], [10.2, 55.8], [9.7, 55.2], [10, 54.7], [10.9, 54.35], [11.1, 54], [12.1, 54.15], [13, 54.45], [13.8, 54.1], [14.3, 53.9], [16, 54.25], [18, 54.8], [20, 54.4], [20, 42], [-9.3, 42]],
    // Zealand and southern Sweden
    [[11, 55.7], [12.5, 55.6], [12.6, 56.1], [11.6, 55.95]],
    [[12.8, 56], [12.9, 55.4], [14.2, 55.4], [14.4, 56], [16.5, 57], [16, 60], [11.3, 59], [11.8, 57.6]]
  ],
  // mountains, hills, forests and lakes (see mapdraw.js)
  terrain: [
    ...stampLine('mtn', [[-5.4, 57.4], [-4.4, 57.1], [-3.4, 56.9], [-4.6, 56.5]], 300, 3),        // Scottish Highlands
    ...stampLine('hill', [[-2.3, 55.0], [-2.0, 54.2], [-1.9, 53.3]], 260, 3),                    // the Pennines
    ...stampLine('mtn', [[-3.95, 53.05], [-3.7, 52.4]], 210, 3),                                 // Snowdonia
    ...stampLine('forest', [[-1.15, 53.3], [-1.05, 53.05]], 170, 2),                             // Sherwood Forest
    ...stampLine('forest', [[-2.4, 48.05], [-1.9, 47.95]], 220, 2),                              // Broceliande
    ...stampLine('hill', [[-0.9, 48.75], [-0.2, 48.55]], 260, 2),                                // the Normandy bocage
    ...stampLine('forest', [[-0.9, 48.75], [-0.2, 48.55]], 200, 3),
    ...stampLine('forest', [[1.9, 47.95], [2.7, 48.35]], 220, 3),                                // Orleans and Fontainebleau
    ...stampLine('hill', [[3.8, 47.4], [4.2, 46.9]], 260, 2),                                    // the Morvan
    ...stampLine('hill', [[4.6, 49.85], [5.6, 50.05], [6.4, 50.35]], 330, 3),                    // the Ardennes
    ...stampLine('forest', [[4.6, 49.85], [5.6, 50.05], [6.4, 50.35]], 330, 4),
    ...stampLine('hill', [[6.5, 50.45], [7.0, 50.15]], 240, 2),                                  // the Eifel
    ...stampLine('mtn', [[6.95, 47.85], [7.2, 48.85]], 240, 3),                                  // the Vosges
    ...stampLine('mtn', [[8.05, 47.75], [8.35, 48.75]], 220, 3),                                 // the Black Forest
    ...stampLine('forest', [[8.05, 47.75], [8.35, 48.75]], 300, 4),
    ...stampLine('forest', [[8.2, 52.15], [9.0, 51.8]], 200, 3),                                 // Teutoburg Forest
    ...stampLine('forest', [[9.7, 53.25], [10.4, 53.0]], 230, 2),                                // Luneburg Heath
    ['mtn', 10.65, 51.78, 220], ...stampLine('forest', [[10.3, 51.8], [11.0, 51.7]], 230, 2),     // the Harz
    ...stampLine('hill', [[10.1, 50.7], [11.5, 50.45]], 260, 3),                                 // Thuringian Forest
    ...stampLine('forest', [[10.1, 50.7], [11.5, 50.45]], 240, 3),
    ...stampLine('hill', [[12.4, 49.4], [13.8, 48.8]], 320, 3),                                  // Bavarian Forest
    ...stampLine('forest', [[12.4, 49.4], [13.8, 48.8]], 300, 3),
    ...stampLine('mtn', [[5.9, 46.6], [7.5, 46.75], [9.5, 46.85], [11.5, 47.0], [13.5, 46.9], [15.5, 47.1]], 430, 3),   // the Alps
    ...stampLine('hill', [[14.0, 50.7], [16.5, 50.5]], 280, 3),                                  // the Ore and Sudeten mountains
    ['water', 5.25, 52.8, 200], ['water', 5.45, 52.55, 150], ['water', 5.05, 52.6, 120],          // the IJsselmeer
    ['water', 9.3, 47.62, 120], ['water', 12.7, 53.45, 100]                                      // Lake Constance, the Muritz
  ],
  // seven sectors along the coast from Brittany to Germany
  sectors: ['Brest', 'Cherbourg', 'Caen', 'Rouen', 'Calais', 'Antwerp', 'Bremen'],
  laneTags: [' Heights', '', ' Roads'],
  // [lon, lat] for each lane: index 0 = Allied home, 1..7 = the sectors west to east, 8 = Axis home
  lanes: [
    [[-3.9, 48.15], [-3.2, 48.05], [-1.2, 48.4], [0.1, 48.5], [1.8, 48.7], [2.9, 50], [5.2, 50.4], [9.3, 52], [12.6, 51.6]],
    [[-4.55, 48.4], [-4.15, 48.42], [-1.45, 49.45], [-0.37, 49.1], [1.1, 49.44], [1.95, 50.8], [4.4, 51.22], [8.8, 53.08], [12.7, 52.5]],
    [[-4.3, 49.9], [-5.3, 49], [-2.2, 50.15], [-0.6, 49.95], [0.5, 50.3], [1.9, 51.5], [3.1, 52.1], [6.8, 54.1], [8.0, 54.55]]
  ],
  // the Allied homeland: three more points on the road from the headquarters to the invasion beach
  homeland: { name: 'England', names: ['Southampton', 'London', 'Dover'],
    nodes: [[-3.6, 50.75], [-1.2, 50.95], [-0.1, 51.5], [0.75, 51.22], [1.95, 50.8]] },
  invade: { col: 4, lane: 1, fromSea: false },     // the Axis ferry troops to Dover while they hold Calais
  islands: false,
  // The campaign opens in 1940: the Allies cling to Brittany and the Axis are already ashore at Dover
  start: (c, l) => c === 0 ? ALLY : AXIS,
  homeStart: [ALLY, ALLY, AXIS],
  seasons: EU_SEASONS,
  grid: [2, 1],
  labels: [['ENGLAND', -1.4, 52.4, 15], ['FRANCE', 2.6, 47.3, 15], ['GERMANY', 10.2, 50.6, 15], ['IRELAND', -8, 53.2, 12],
    ['English Channel', -2.6, 50.28, 10, 1], ['North Sea', 3.2, 54.2, 12, 1], ['Bay of Biscay', -5.5, 46.9, 10, 1], ['Baltic', 14.6, 54.9, 10, 1]],
  hqLabels: ['Allied HQ', 'Axis HQ · Berlin'],
  str: {
    goal: 'The Allies are hanging on by their fingernails: only Brittany is left on the Continent and the Axis are ashore at Dover. Push the front line east, sector by sector, until the Axis headquarters in Berlin falls. Click a sector on the map, then choose a vehicle.',
    advance: 'The front line moves east', retreat: 'The Axis push the front line west'
  },
  help: '<b>The campaign.</b> Seven sectors along the Channel and North Sea coast lie between your headquarters in England and theirs in Berlin, each with two points on land and one at sea. It is 1940 and the Allies are nearly beaten: only Brest is still in Allied hands and the Axis have a foothold at Dover. Destroy a point\'s command post, then hold the ground with tanks and infantry (or the water with warships) to capture it. Points fall in order, so the front line moves one step at a time. A headquarters can only be attacked once its side has lost every other point on the map. England has three points of its own (Dover, London, Southampton): while the Axis hold Calais they ferry troops across to Dover.<br>',
  names: {}
};

// ---------------------------------------------------------------- Pacific
// The islands are drawn many times larger than life so there is room to fight on them.
const PAC_ISLANDS = [
  { name: 'Midway', c: [182.4, 28.4], rx: 3.4, ry: 1.9, rot: 0.15, sea: [183.2, 24.4], pts: ['Eastern Island', 'Sand Island', 'Midway Atoll'] },
  { name: 'Wake', c: [166.8, 19.8], rx: 3.4, ry: 1.9, rot: -0.3, sea: [168.8, 15.7], pts: ['Wake Airfield', 'Wilkes Island', 'Wake Waters'] },
  { name: 'Tarawa', c: [173.2, 4.2], rx: 3.6, ry: 1.8, rot: 0.5, sea: [177.4, 1.6], pts: ['Bairiki', 'Betio', 'Tarawa Lagoon'] },
  { name: 'Guadalcanal', c: [160.0, -5.6], rx: 3.8, ry: 1.7, rot: -0.35, sea: [160.6, -1.6], pts: ['Henderson Field', 'Lunga Point', 'Ironbottom Sound'] },
  { name: 'Saipan', c: [146.6, 14.4], rx: 3.4, ry: 2.0, rot: 1.45, sea: [142.2, 13.4], pts: ['Mount Tapochau', 'Garapan', 'Philippine Sea'] },
  { name: 'Iwo Jima', c: [141.6, 24.6], rx: 3.2, ry: 1.8, rot: 0.6, sea: [144.9, 22.2], pts: ['Mount Suribachi', 'Airfield No. 1', 'Iwo Jima Waters'] },
  { name: 'Okinawa', c: [128.2, 26.6], rx: 3.8, ry: 1.6, rot: 0.75, sea: [131.8, 24.6], pts: ['Shuri Castle', 'Hagushi Beach', 'Okinawa Waters'] }
];
const PAC_HOME_LANES = [[[186.8, 30.4], [186.8, 27.4], [189.5, 24.4]], [[130.6, 32.1], [131.3, 33.2], [134.0, 30.4]]];
// lanes for an island-hopping theatre: two points on each island (the landing beach faces the way the Allies
// come from) and one offshore, between the two home lanes. 'from' is where the Allied fleet sails from.
function islandLanes(isles, home, from) {
  const lanes = [[home[0][0]], [home[0][1]], [home[0][2]]];
  let prev = from;
  for (const s of isles) {
    if (s.lanes) { for (let l = 0; l < 3; l++) lanes[l].push(s.lanes[l]); prev = s.lanes[1]; continue; }   // a sector on the mainland
    const k = s.rx * 0.46, dx = Math.cos(s.rot) * k, dy = Math.sin(s.rot) * k;
    let a = [s.c[0] + dx, s.c[1] + dy], b = [s.c[0] - dx, s.c[1] - dy];
    if (Math.hypot(a[0] - prev[0], a[1] - prev[1]) > Math.hypot(b[0] - prev[0], b[1] - prev[1])) [a, b] = [b, a];
    lanes[0].push(b); lanes[1].push(a); lanes[2].push(s.sea);
    prev = s.c;
  }
  for (let l = 0; l < 3; l++) lanes[l].push(home[1][l]);
  return lanes;
}
function pacLanes() { return islandLanes(PAC_ISLANDS, PAC_HOME_LANES, [202, 21.3]); }    // the fleet sails from Pearl Harbor
const PAC_THEATRE = {
  id: 'pac', title: 'Pacific', place: 'Pacific', blurb: 'From Pearl Harbor, island by island, to Tokyo',
  box: { lon0: 122, lon1: 210, lat0: -10, lat1: 40 },
  face: [-1, 1],               // the Allies look west, across the ocean toward Japan
  base: [[205.0, 20.6], [139.4, 36.2]],        // Allied HQ at Pearl Harbor, Axis HQ at Tokyo
  airport: [[202.4, 19.8], [137.8, 35.9]],
  home: [
    { depot: [205.6, 23.0], airDepot: [208.5, 17.0], dockFrom: [205.0, 20.6], dockDir: [0, 1], dockYaw: 0, seaFar: [208.2, 15.2] },
    { depot: [140.2, 37.4], airDepot: [134.5, 38.5], dockFrom: [139.4, 36.2], dockDir: [0, 1], dockYaw: 0, seaFar: [137.5, 31.6] }
  ],
  land: [
    // Hawaii (one big stylised island around Pearl Harbor)
    [[196.2, 22.8], [197.5, 24.2], [199.5, 24.9], [201.8, 24.6], [203.6, 25.0], [205.6, 24.2], [207.2, 22.6], [207.6, 20.8], [206.6, 19.0], [204.8, 17.9], [203.0, 18.3], [201.6, 17.6], [199.6, 18.2], [197.6, 19.2], [196.3, 20.8]],
    // Japan: Honshu, Kyushu, Shikoku
    [[130.9, 34.0], [131.8, 33.95], [132.6, 34.2], [133.6, 34.45], [134.6, 34.65], [135.2, 34.4], [135.3, 33.5], [136.0, 33.5], [136.8, 34.2], [137.4, 34.55], [138.3, 34.6], [138.8, 34.6], [139.2, 34.85], [139.9, 34.85], [140.3, 35.1], [140.9, 35.8], [140.9, 36.9], [141.1, 38.2], [141.6, 39.4], [142.2, 40.6], [142.4, 42], [139.6, 42], [139.9, 39.9], [139.9, 38.8], [139.1, 38.0], [138.2, 37.7], [137.2, 37.3], [136.6, 36.9], [136.1, 36.1], [135.5, 35.75], [134.2, 35.7], [133.0, 35.6], [132.3, 35.3], [131.4, 34.6]],
    [[129.6, 33.5], [130.6, 33.95], [131.2, 33.9], [131.9, 33.3], [131.9, 32.3], [131.3, 31.3], [130.6, 31.0], [130.1, 31.4], [129.8, 32.6]],
    [[132.3, 33.8], [133.4, 34.1], [134.6, 34.0], [134.7, 33.4], [133.4, 32.8], [132.5, 32.9]],
    // Korea and Taiwan
    [[126.1, 34.4], [127.5, 34.6], [129.3, 35.2], [129.5, 36.5], [129.4, 38], [128.4, 38.6], [127.4, 39.8], [128.5, 41], [124, 41], [125.2, 38], [126.6, 37], [126.3, 35.6]],
    [[121.0, 25.3], [122.0, 25.0], [121.6, 23.5], [120.9, 22.0], [120.2, 22.6], [120.1, 23.6]],
    // the Philippines: Luzon, the Visayas, Mindanao
    [[120.6, 18.5], [122.2, 18.5], [122.5, 17], [121.6, 15.8], [122, 14.2], [123.9, 13.8], [124.2, 12.6], [123.3, 13], [121.8, 13.9], [120.6, 14.3], [120.0, 16.2], [120.4, 17.5]],
    [[124.3, 12.5], [125.8, 12.2], [125.7, 10.2], [124.7, 10.1], [124.3, 11.4]],
    [[121.9, 11.9], [123.2, 11.5], [123.3, 9.2], [122.4, 9.8], [122, 10.8]],
    [[122.0, 7.7], [123.6, 8.7], [125.3, 9.8], [126.6, 8.5], [126.2, 6.3], [125.4, 5.6], [124, 6.3], [122.2, 7]],
    // New Guinea and New Britain
    [[131, -1.0], [134, -0.8], [135.5, -3.2], [138, -1.6], [141, -2.6], [144.5, -3.8], [146, -5.5], [147.8, -6.3], [148.2, -8.2], [150.0, -10.3], [150, -12], [140, -12], [141, -9.2], [138.8, -8.2], [137.8, -5.2], [135, -4.5], [133, -4.0], [132, -2.8]],
    [[148.4, -5.6], [150.3, -5.4], [151.8, -4.3], [152.3, -4.7], [151.1, -6.1], [149, -6.2]],
    // a scatter of atolls with no fighting on them
    islandBlob([167.7, 9.0], 0.9, 0.55, 0.4, 3), islandBlob([151.8, 7.4], 1.0, 0.7, -0.2, 7), islandBlob([134.5, 7.6], 0.9, 0.5, 1.1, 11),
    islandBlob([197.0, 27.6], 0.6, 0.4, 0.3, 5), islandBlob([153.9, 24.3], 0.6, 0.45, 0.8, 13),
    // the seven battle islands
    ...PAC_ISLANDS.map((s, i) => islandBlob(s.c, s.rx, s.ry, s.rot, 21 + i * 4))
  ],
  terrain: [
    ...stampLine('mtn', [[199.8, 19.3], [201.0, 18.8]], 230, 2), ...stampLine('forest', [[203.2, 24.4], [205.6, 23.9]], 260, 3),   // Hawaii
    ...stampLine('mtn', [[137.6, 36.5], [137.8, 35.7]], 170, 3), ['mtn', 138.73, 35.36, 130], ...stampLine('forest', [[139.6, 37.6], [140.6, 38.8]], 220, 3),  // Japan
    ...stampLine('hill', [[131.0, 33.2], [131.2, 32.0]], 160, 2), ...stampLine('hill', [[128.4, 38.0], [128.9, 36.0]], 170, 3),
    ...stampLine('mtn', [[121.1, 24.6], [120.9, 22.8]], 120, 3), ...stampLine('mtn', [[121.0, 17.9], [121.1, 16.3]], 130, 3),   // Taiwan, Luzon
    ...stampLine('forest', [[122.2, 13.6], [124.0, 13.1]], 180, 2), ...stampLine('forest', [[124.5, 7.6], [125.8, 8.6]], 200, 2),
    ...stampLine('mtn', [[137.5, -3.6], [141.5, -4.6], [145.0, -5.8]], 230, 3), ...stampLine('forest', [[133, -2.2], [138, -2.6], [142, -3.6], [146.5, -7.0]], 300, 3),   // New Guinea
    // the battle islands: jungle around the beaches, a peak at the far end
    ...PAC_ISLANDS.map(s => ['forest', s.c[0], s.c[1], 260]),
    ...PAC_ISLANDS.map(s => ['hill', +(s.c[0] - Math.cos(s.rot) * s.rx * 0.95).toFixed(2), +(s.c[1] - Math.sin(s.rot) * s.rx * 0.95).toFixed(2), 150])
  ],
  sectors: PAC_ISLANDS.map(s => s.name),
  laneTags: [' Airfield', ' Beach', ' Waters'],
  pointNames: PAC_ISLANDS.map(s => s.pts),
  lanes: pacLanes(),
  homeland: { name: 'Hawaii', names: ['Hickam Field', 'Honolulu', 'Haleiwa'],
    nodes: [[205.4, 21.8], [203.6, 22.6], [200.6, 21.9], [197.8, 22.9], [194.6, 24.2]] },
  invade: { col: 1, lane: 1, fromSea: true },      // while Japan holds Wake its landing craft can reach the beaches of Hawaii
  islands: true,
  // December 1941: Japan has taken everything west of Midway and has troops ashore on Hawaii
  start: (c, l) => c === 0 ? ALLY : AXIS,
  homeStart: [ALLY, ALLY, AXIS],
  seasons: PAC_SEASONS,
  grid: [10, 10],
  labels: [['HAWAII', 201.8, 26.4, 13], ['JAPAN', 136.8, 39.0, 14], ['PHILIPPINES', 123.6, 16.0, 10], ['NEW GUINEA', 140.5, -6.0, 12], ['KOREA', 127.2, 37.6, 9],
    ['Pacific Ocean', 190, 10, 16, 1], ['Philippine Sea', 134, 19, 11, 1], ['Solomon Sea', 153, -8.4, 10, 1], ['East China Sea', 125.6, 31, 10, 1], ['Coral Sea', 158, -9.2, 10, 1]],
  hqLabels: ['Allied HQ · Pearl Harbor', 'Axis HQ · Tokyo'], hqBelow: [1, 0],
  str: {
    goal: 'Pearl Harbor is burning, Japan holds every island west of Midway and its troops are ashore on Hawaii. Take the Pacific back island by island, from Midway to Okinawa, until the headquarters in Tokyo falls. Click a sector on the map, then choose a vehicle.',
    advance: 'Another island taken. On toward Japan', retreat: 'Japan pushes us back toward Hawaii'
  },
  help: '<b>The campaign.</b> Seven island battlegrounds lie between Pearl Harbor and Tokyo, each with two points ashore and one at sea. It is December 1941 and the Allies are nearly beaten: only Midway still holds and Japanese troops have landed on Hawaii. Ground forces cannot drive from island to island: pick the next island on the map to make an amphibious landing on its beach (landing ships and paratroopers go in the same way). Destroy a point\'s command post, then hold the ground (or the water with warships) to capture it. A headquarters can only be attacked once its side has lost every other point on the map. Hawaii has three points of its own (Haleiwa, Honolulu, Hickam Field): while Japan holds Wake its landing craft come ashore at Haleiwa.<br>',
  names: {
    spitfire: 'F4F Wildcat', mustang: 'F6F Hellcat', troops: 'Marine Rifle Squad',
    bf109: 'A6M Zero', fw190: 'Ki-84 Hayate', bf110: 'Ki-45 Toryu', fi167: 'B5N Kate', fa223: 'Ka-1 Autogyro', ju88: 'G4M Betty', he111: 'G8N Renzan',
    ju52: 'Ki-57 Topsy', me323: 'Ku-7 Manazuru', me264: 'G10N Fugaku',
    grenadier: 'Imperial Rifle Squad', kubel: 'Type 95 Kurogane', flakwagen: 'Type 98 AA Half-track', panzer4: 'Type 97 Chi-Ha', wespe: 'Type 4 Ho-Ro', tiger: 'Type 4 Chi-To', opel: 'Isuzu Type 94',
    z23: 'Fubuki Destroyer', sboot: 'Gyoraitei', uboat: 'I-400 Submarine', hipper: 'Takao Cruiser', bismarck: 'Nagato', zeppelin: 'Akagi', tirpitz: 'Yamato',
    freighter: 'Maru Freighter', mfp: 'Daihatsu Landing Craft'
  }
};

// ---------------------------------------------------------------- Modern Era: the United States against China
// The Western Pacific today. The islands are drawn larger than life, as in the Pacific campaign; the last two
// sectors are on the Chinese mainland, so once ashore there the ground forces can drive on to Beijing.
const MOD_ISLANDS = [
  { name: 'Okinotori Reef', c: [137.6, 19.4], rx: 1.9, ry: 1.1, rot: 0.2, sea: [138.6, 16.6], pts: ['Reef Station', 'Lagoon Beach', 'Okinotori Waters'] },
  { name: 'Okinawa', c: [129.4, 27.0], rx: 2.1, ry: 1.0, rot: 0.75, sea: [132.0, 24.6], pts: ['Kadena Air Base', 'Naha Beach', 'Okinawa Waters'] },
  { name: 'Senkaku', c: [124.6, 25.4], rx: 1.5, ry: 0.85, rot: 0.1, sea: [125.4, 23.0], pts: ['Uotsuri Peak', 'Senkaku Beach', 'Senkaku Waters'] },
  { name: 'Taiwan', c: [121.7, 23.6], rx: 2.1, ry: 1.0, rot: 1.3, sea: [123.6, 20.6], pts: ['Kaohsiung', 'Taipei Harbor', 'Luzon Strait'] },
  { name: 'Zhoushan', c: [124.0, 30.4], rx: 1.5, ry: 0.85, rot: 0.6, sea: [125.8, 29.0], pts: ['Zhoushan Port', 'Zhujiajian Beach', 'Zhoushan Waters'] },
  { name: 'Qingdao', lanes: [[119.7, 36.4], [120.2, 36.15], [121.4, 35.2]], pts: ['Laoshan', 'Qingdao Beach', 'Yellow Sea'] },
  { name: 'Tianjin', lanes: [[117.0, 39.35], [117.55, 39.15], [119.0, 38.75]], pts: ['Tianjin Airport', 'Tianjin Port', 'Bohai Sea'] }
];
// radar-guided air-to-air missile for the Modern Era fighters (replaces their bombs)
const AAM = dmg => ({ kind: 'aam', dmg, splash: 12, cd: 5, vel: 270, range: 1500, turn: 2.4, label: 'Missiles' });
// surface-to-air missile for the Stryker M-SHORAD and PGZ-09: slower to reload, but fired from the ground
const SAM = { kind: 'aam', dmg: 130, splash: 14, cd: 8, vel: 250, range: 1400, turn: 2.2, label: 'SAM Missiles' };
const MOD_HOME_LANES = [[[147.6, 15.9], [147.4, 14.7], [150.8, 13.2]], [[116.0, 39.7], [116.9, 39.75], [119.9, 39.2]]];
const MOD_GUAM = islandBlob([146.0, 15.0], 4.4, 2.3, 0.05, 61);
const MOD_THEATRE = {
  id: 'mod', title: 'Modern Era', place: 'Western Pacific', blurb: 'USA vs China: from Guam across the Pacific to Beijing',
  game: 'Frontline: Modern Era',
  box: { lon0: 100, lon1: 160, lat0: 11, lat1: 42 },
  face: [-1, 1],               // the Americans look west, toward China
  base: [[148.0, 14.6], [116.4, 39.95]],       // US HQ on Guam, Chinese HQ at Beijing
  airport: [[145.0, 14.6], [115.0, 39.3]],
  home: [
    { depot: [146.4, 16.2], airDepot: [151.5, 12.6], dockFrom: [148.0, 14.6], dockDir: [0, 1], dockYaw: 0, seaFar: [150.0, 11.8] },
    { depot: [115.9, 40.7], airDepot: [113.2, 40.4], dockFrom: [117.55, 39.0], dockDir: [1, 0], dockYaw: Math.PI / 2, seaFar: [119.6, 38.7] }
  ],
  land: [
    // Guam (one big stylised island)
    MOD_GUAM,
    // the Asian mainland: Vietnam, China and Korea
    [[98, 10], [106.5, 10.2], [108, 10.9], [109.2, 11.6], [109.3, 13.5], [108.8, 15.2], [107.8, 16.3], [106.6, 17.6], [105.9, 19.4], [106.6, 20.6], [108, 21.6], [109.6, 21.5], [110.2, 20.6], [110.6, 21.2], [111.8, 21.6], [113, 22], [113.6, 22.6], [114.3, 22.3], [115.5, 22.8], [116.6, 23.2], [117.6, 23.8], [118.4, 24.4], [119.2, 25], [119.6, 26], [119.9, 26.7], [120.5, 27.5], [121.1, 28.2], [121.7, 29], [122, 29.9], [121, 30.4], [121.9, 30.9], [121.9, 31.7], [121, 32.3], [120.9, 33], [120.3, 34.2], [119.3, 34.8], [119.6, 35.5], [120.3, 36], [121, 36.6], [122, 36.9], [122.6, 37.3], [122, 37.6], [121.2, 37.7], [120.2, 37.6], [119.2, 37.2], [118.9, 38], [118, 38.4], [117.6, 38.9], [117.8, 39.3], [118.8, 39.3], [119.5, 39.9], [120.6, 40.5], [121.6, 40.9], [122.3, 40.5], [121.6, 39.6], [121.2, 38.85], [121.8, 39], [122.4, 39.5], [123.4, 39.8], [124.3, 39.95], [125.1, 39.6], [125, 38.8], [125.6, 37.8], [126.6, 37.6], [126.4, 36.4], [126.5, 35], [126.4, 34.4], [127.4, 34.6], [128.5, 34.9], [129.3, 35.3], [129.5, 36.5], [129.4, 37.8], [128.4, 38.6], [127.5, 39.6], [128.6, 40.6], [129.8, 41], [130.6, 42.4], [131, 44], [98, 44]],
    // Hainan
    [[108.6, 19.2], [109.6, 20.1], [110.7, 20.1], [111.0, 19.6], [110.5, 18.7], [109.6, 18.2], [108.7, 18.5]],
    // Japan: Honshu, Kyushu, Shikoku
    PAC_THEATRE.land[1], PAC_THEATRE.land[2], PAC_THEATRE.land[3],
    // the Philippines: Luzon, the Visayas, Mindanao
    PAC_THEATRE.land[6], PAC_THEATRE.land[7], PAC_THEATRE.land[8],
    // a few small islands with no fighting on them
    islandBlob([125.4, 33.4], 0.6, 0.4, 0.2, 9), islandBlob([140.0, 25.0], 0.6, 0.4, 0.7, 15), islandBlob([154.5, 19.5], 0.5, 0.35, 0.3, 17),
    // the battle islands
    ...MOD_ISLANDS.filter(s => s.c).map((s, i) => islandBlob(s.c, s.rx, s.ry, s.rot, 41 + i * 4))
  ],
  terrain: [
    ...stampLine('hill', [[147.0, 13.9], [147.8, 13.6]], 200, 2), ...stampLine('forest', [[144.3, 14.6], [145.0, 13.9]], 240, 2),   // Guam
    ...stampLine('mtn', [[113.6, 35.8], [114.2, 37.4], [114.8, 39.2]], 260, 3),     // the Taihang Mountains
    ...stampLine('mtn', [[115.2, 41.3], [117.0, 41.2], [118.8, 41.0]], 220, 3),     // the Yan Mountains, north of Beijing
    ...stampLine('hill', [[116.6, 36.3], [117.8, 36.1]], 200, 2),                   // Mount Tai
    ...stampLine('mtn', [[104.5, 33.8], [108.5, 34.0], [111.0, 33.6]], 300, 3),     // the Qinling
    ...stampLine('mtn', [[110.5, 25.2], [113.5, 25.0], [116.0, 24.6]], 240, 3), ...stampLine('hill', [[116.8, 26.5], [118.0, 28.0]], 240, 2),   // Nanling, Wuyi
    ...stampLine('forest', [[106.0, 26.0], [110.0, 27.5], [114.0, 28.5]], 380, 3), ...stampLine('forest', [[102.0, 22.5], [105.0, 22.0]], 320, 2),
    ...stampLine('mtn', [[105.4, 19.4], [107.2, 16.4], [108.2, 14.2]], 200, 3), ...stampLine('forest', [[104.8, 18.2], [107.0, 14.5]], 260, 3),   // the Annamite range
    ...stampLine('hill', [[127.8, 40.3], [128.6, 38.4], [129.0, 36.4]], 200, 3),    // Korea's eastern ridge
    ...stampLine('mtn', [[137.6, 36.5], [137.8, 35.7]], 160, 3), ['mtn', 138.73, 35.36, 120],   // the Japanese Alps and Fuji
    ...stampLine('mtn', [[121.0, 17.9], [121.1, 16.3]], 130, 3),                    // Luzon
    ...MOD_ISLANDS.filter(s => s.c).map(s => ['forest', s.c[0], s.c[1], 200])
  ],
  sectors: MOD_ISLANDS.map(s => s.name),
  laneTags: [' Base', ' Beach', ' Waters'],
  pointNames: MOD_ISLANDS.map(s => s.pts),
  lanes: islandLanes(MOD_ISLANDS, MOD_HOME_LANES, [148.0, 14.6]),
  homeland: { name: 'Guam', names: ['Andersen AFB', 'Hagåtña', 'Apra Harbor'],
    nodes: [[147.6, 15.2], [146.6, 15.9], [145.0, 15.4], [143.2, 14.9], [140.4, 15.6]] },
  invade: { col: 1, lane: 1, fromSea: true },      // while China holds Okinawa its landing ships can reach the beaches of Guam
  islands: true,
  // China has struck first: it holds every island west of Okinotori Reef and its marines are ashore on Guam
  start: (c, l) => c === 0 ? ALLY : AXIS,
  homeStart: [ALLY, ALLY, AXIS],
  seasons: PAC_SEASONS,
  grid: [5, 5],
  sides: { adj: ['US', 'Chinese'], pl: ['Americans', 'Chinese'] },
  labels: [['GUAM', 146.0, 18.4, 12], ['CHINA', 112.5, 31.5, 16], ['JAPAN', 136.8, 38.6, 13], ['KOREA', 127.4, 38.2, 9], ['PHILIPPINES', 123.6, 16.0, 10], ['VIETNAM', 105.2, 16.4, 9],
    ['Pacific Ocean', 153, 25, 15, 1], ['Philippine Sea', 133, 21.5, 11, 1], ['East China Sea', 126.0, 30.5, 10, 1], ['South China Sea', 114.5, 17.5, 11, 1], ['Yellow Sea', 123.4, 35.6, 10, 1]],
  hqLabels: ['US HQ · Guam', 'Chinese HQ · Beijing'], hqBelow: [1, 0],
  str: {
    goal: 'China has struck first: it holds every island from Okinawa to Taiwan and its marines are ashore on Guam. Fight back island by island, from Okinotori Reef to Taiwan, then land on the Chinese coast and drive on to the headquarters in Beijing. Click a sector on the map, then choose a vehicle.',
    advance: 'Another sector taken. On toward Beijing', retreat: 'China pushes us back toward Guam'
  },
  help: '<b>The campaign.</b> Seven battlegrounds lie between Guam and Beijing, each with two points ashore and one at sea: five islands, then Qingdao and Tianjin on the Chinese coast. China has struck first and the Americans are nearly beaten: only Okinotori Reef still holds and Chinese marines have landed on Guam. Ground forces cannot drive from island to island: pick the next sector on the map to make an amphibious landing on its beach (landing ships and paratroopers go in the same way). Destroy a point\'s command post, then hold the ground (or the water with warships) to capture it. A headquarters can only be attacked once its side has lost every other point on the map. Guam has three points of its own (Apra Harbor, Hagåtña, Andersen AFB): while China holds Okinawa its landing ships come ashore at Apra Harbor.<br>',
  names: {
    c47: 'C-130 Hercules', spitfire: 'F-16 Fighting Falcon', mustang: 'F/A-18 Super Hornet', avenger: 'P-8 Poseidon', r4: 'AH-64 Apache', p38: 'F-35 Lightning II',
    b25: 'A-10 Warthog', b17: 'B-1B Lancer', b24: 'B-2 Spirit', b52: 'B-52 Stratofortress', c54: 'C-17 Globemaster',
    truck: 'HEMTT Truck', troops: 'Army Rifle Squad', jeep: 'Humvee', halftrack: 'Stryker M-SHORAD', sherman: 'M2 Bradley', priest: 'M109 Paladin', pershing: 'M1A2 Abrams',
    liberty: 'Container Ship', lst: 'San Antonio Landing Ship', ward: 'Arleigh Burke Destroyer', pt: 'Mark VI Patrol Boat', gato: 'Virginia-class Sub',
    atlanta: 'Ticonderoga Cruiser', essex: 'USS Gerald R. Ford', iowa: 'USS Zumwalt', arizona: 'Arsenal Ship',
    bf109: 'J-10 Vigorous Dragon', fw190: 'J-16 Strike Fighter', bf110: 'J-20 Mighty Dragon', fi167: 'KQ-200 Sub Hunter', fa223: 'Z-10 Attack Helicopter',
    ju88: 'JH-7 Flying Leopard', he111: 'H-6K Bomber', me264: 'H-20 Stealth Bomber', ju52: 'Y-9 Transport', me323: 'Y-20 Kunpeng',
    grenadier: 'PLA Rifle Squad', kubel: 'Dongfeng Mengshi', flakwagen: 'PGZ-09 AA Gun', panzer4: 'ZBD-04 Fighting Vehicle', wespe: 'PLZ-05 Howitzer', tiger: 'Type 99A Tank', opel: 'Shaanxi Truck',
    z23: 'Type 052D Destroyer', sboot: 'Type 022 Missile Boat', uboat: 'Type 093 Sub', hipper: 'Type 055 Cruiser', bismarck: 'Type 055 Flagship', zeppelin: 'Fujian Carrier', tirpitz: 'Type 076 Assault Carrier',
    freighter: 'COSCO Freighter', mfp: 'Type 071 Landing Ship'
  },
  // modern shapes and performance, per unit (both sides listed)
  looks: {
    spitfire: { model: 'jet', speed: 145, alt: AAM(85) }, mustang: { model: 'jet', twinTail: 1, speed: 160, alt: AAM(110) }, p38: { model: 'jet', stealth: 1, big: 1.1, speed: 170, alt: AAM(140) },
    avenger: { model: 'jetliner', engines: 2, big: 0.75, speed: 125 }, r4: { model: 'attackheli', speed: 68 },
    b25: { model: 'a10', big: 1, speed: 115 }, b17: { model: 'jetbomber', engines: 4, speed: 135 }, b24: { model: 'flywing', speed: 140 },
    c54: { model: 'jetliner', highWing: 1, engines: 4, big: 1.05, speed: 120 },
    bf109: { model: 'jet', canard: 1, speed: 145, alt: AAM(85) }, fw190: { model: 'jet', twinTail: 1, speed: 160, alt: AAM(110) }, bf110: { model: 'jet', stealth: 1, canard: 1, big: 1.15, speed: 170, alt: AAM(140) },
    fi167: { model: 'bomber', engines: 2, big: 0.6, cargoLook: 1 }, fa223: { model: 'attackheli', speed: 68 },
    ju88: { model: 'jet', big: 1.2, speed: 125 }, he111: { model: 'jetbomber', engines: 2, speed: 125 }, me264: { model: 'flywing', speed: 140 },
    me323: { model: 'jetliner', highWing: 1, engines: 4, big: 1.05, speed: 120 },
    troops: { uni: 0x8b8462, helm: 0x6e6a4e, legs: 0x7a7356 }, grenadier: { uni: 0x4f6040, helm: 0x46553a, legs: 0x3f4c34 },
    jeep: { model: 'humvee' }, kubel: { model: 'humvee' }, halftrack: { model: 'stryker', alt: SAM }, flakwagen: { model: 'stryker', alt: SAM },
    sherman: { model: 'moderntank', kind: 'ifv' }, panzer4: { model: 'moderntank', kind: 'ifv' },
    priest: { model: 'moderntank', kind: 'spg' }, wespe: { model: 'moderntank', kind: 'spg' },
    pershing: { model: 'moderntank', kind: 'mbt' }, tiger: { model: 'moderntank', kind: 'mbt' },
    ward: { modern: 1, turrets: [1, 0], vls: 2 }, z23: { modern: 1, turrets: [1, 0], vls: 2 }, pt: { modern: 1, turrets: [1, 0], vls: 0 }, sboot: { modern: 1, turrets: [1, 0], vls: 0 },
    gato: { modern: 1 }, uboat: { modern: 1 }, atlanta: { modern: 1, turrets: [1, 1], vls: 4 }, hipper: { modern: 1, turrets: [1, 1], vls: 4 },
    iowa: { modern: 1, stealthShip: 1, turrets: [2, 0], vls: 4 }, bismarck: { modern: 1, turrets: [1, 0], vls: 4 },
    arizona: { modern: 1, turrets: [1, 1], vls: 6 }, tirpitz: { modern: 1, turrets: [1, 1], vls: 6 }, essex: { modern: 1 }, zeppelin: { modern: 1 }
  },
  // secondary-weapon labels (the Chinese counterparts pick these up too)
  alts: { troops: 'Javelin', r4: 'Hellfires', b24: 'Nuclear bomb', b25: 'Bombs' },
  // descriptions that name WW2 equipment; the Chinese counterparts pick these up too
  descs: {
    troops: 'Eight soldiers with a Javelin missile launcher.', jeep: 'Fast armored scout car with a .50 cal.', halftrack: 'Anti-aircraft vehicle. Machine guns + homing surface-to-air missiles.',
    sherman: 'Infantry fighting vehicle. Rapid-fire cannon.', priest: 'Self-propelled howitzer. Huge range and blast, slow to reload.', pershing: 'Main battle tank. 120mm cannon.',
    spitfire: 'Agile jet fighter. Cannon + homing air-to-air missiles.', mustang: 'Faster, tougher carrier jet. Cannon + stronger missiles.', p38: 'Stealth fighter. Hard-hitting cannon, deadliest missiles.',
    avenger: 'Sub-hunting patrol plane. Drops torpedoes on ships.', r4: 'Attack helicopter. Hovers, strafes, fires Hellfire rockets.',
    b25: 'Ground-attack jet. Four bombs, fast turnaround.', b17: 'Supersonic heavy bomber with defensive guns.', b24: 'Stealth bomber carrying a nuclear bomb. One drop obliterates everything beneath it.',
    c47: 'Cargo plane. Flies supply runs and pays cash on every return.', c54: 'Jet transport. Parachutes ground reinforcements in.',
    ward: 'Guided-missile destroyer. Guns, torpedoes, AA, depth charges.', pt: 'Very fast patrol boat with torpedoes and depth charges.',
    gato: 'Nuclear attack submarine. Dive (C) to vanish from guns; hunts with torpedoes.', atlanta: 'Guided-missile cruiser. Heavy AA screen.',
    iowa: 'Stealth destroyer with long-range guns.', arizona: 'THE top warship. A floating missile battery with a wall of AA.',
    essex: 'Supercarrier. Launches fighter flights from her deck (Space) and lets you take off far from home.',
    liberty: 'Merchant vessel. Pays cash every delivery.', lst: 'Landing ship. Puts two fighting vehicles, an AA vehicle and a rifle squad on the beach.'
  },
  // the A-10 is a flying gunship: its 30mm GAU-8 cannon punches through armour
  tweaks: {
    b25: { hp: 520, gunLabel: 'GAU-8 Cannon', gun: { kind: 'bullet', dmg: 13, rate: 0.03, range: 640, vel: 820, spread: 0.014, ap: 1 },
      desc: 'Flying gunship. The 30mm GAU-8 cannon shreds tanks; four bombs too. Built to take a beating.' }
  },
  // vehicles that exist only in this theatre: copied from `base`, changed by `o`, added to the shop after `after`.
  // `cn` is the Chinese counterpart. lowObs: stealth, enemies only spot and lock it at close range.
  extras: [
    { id: 'mq9', base: 'b25', shop: 'Air', after: 'avenger',
      o: { tier: 2, name: 'MQ-9 Reaper', model: 'drone', big: 1, role: 'bomber', cost: 600, aiCost: 380, hp: 150, speed: 95, turn: 1.0, crew: 0, radius: 8, camDist: 40, camH: 9,
        desc: 'Armed drone. Cheap, quiet, drops two precision bombs.', gunLabel: 'Machine gun', gun: { kind: 'bullet', dmg: 5, rate: 0.14, range: 420, vel: 600, spread: 0.02 },
        alt: { kind: 'bomb', dmg: 200, splash: 26, count: 2, cd: 7, label: 'Guided bombs' } },
      cn: { id: 'wingloong', name: 'Wing Loong II' } },
    { id: 'f14', base: 'mustang', shop: 'Air', after: 'mustang',
      o: { tier: 3, name: 'F-14 Tomcat', model: 'f14', big: 1.05, cost: 1100, aiCost: 620, hp: 260, speed: 165, turn: 1.4, crew: 2,
        desc: 'Swing-wing fleet interceptor. Long-range Phoenix missiles hit from very far away.',
        alt: { kind: 'aam', dmg: 150, splash: 14, cd: 7, vel: 300, range: 2300, turn: 1.9, label: 'Phoenix Missiles' } },
      cn: { id: 'j15', name: 'J-15 Flying Shark' } },
    { id: 'f15', base: 'mustang', shop: 'Air', after: 'p38',
      o: { tier: 4, name: 'F-15EX Eagle II', model: 'jet', twinTail: 1, big: 1.2, cost: 1600, aiCost: 850, hp: 340, speed: 178, turn: 1.5, radius: 8,
        desc: 'Heavy air-superiority fighter. Fast, tough, and its missiles reload quickly.',
        gun: { kind: 'bullet', dmg: 14, rate: 0.065, range: 620, vel: 760, spread: 0.008 }, alt: Object.assign(AAM(135), { cd: 3.5 }) },
      cn: { id: 'j11', name: 'J-11B Flanker' } },
    { id: 'f117', base: 'b25', shop: 'Air', after: 'b25',
      o: { tier: 4, name: 'F-117 Nighthawk', model: 'f117', big: 1, lowObs: 1, cost: 1800, aiCost: 950, hp: 300, speed: 125, turn: 1.0, crew: 1, radius: 9,
        desc: 'Stealth attack jet. Enemies only see it up close. Two laser-guided 2,000 lb bombs.', gunLabel: 'Machine gun',
        gun: { kind: 'bullet', dmg: 5, rate: 0.12, range: 420, vel: 620, spread: 0.02 },
        alt: { kind: 'bomb', dmg: 420, splash: 42, count: 2, cd: 9, label: 'Laser-guided bombs' } },
      cn: { id: 'gj11', name: 'GJ-11 Sharp Sword', o: { model: 'flywing', big: 0.42 } } },
    { id: 'f22', base: 'p38', shop: 'Air', after: 'f15',
      o: { tier: 5, name: 'F-22 Raptor', model: 'jet', stealth: 1, raptor: 1, big: 1.25, lowObs: 1, cost: 2400, aiCost: 1300, max: 2, hp: 360, speed: 190, turn: 1.85, radius: 8,
        desc: 'THE air-superiority fighter. Stealthy, supercruising, deadliest missiles that reload fast.',
        gun: { kind: 'bullet', dmg: 17, rate: 0.06, range: 640, vel: 780, spread: 0.007 }, alt: Object.assign(AAM(170), { cd: 3.5 }) },
      cn: { id: 'j35', name: 'J-35 Stealth Fighter', o: { canard: 0 } } },
    { id: 'rangers', base: 'troops', shop: 'Land', after: 'troops',
      o: { tier: 3, name: 'Army Rangers', cost: 450, aiCost: 300, hp: 220, speed: 16, uni: 0x5c5a48, helm: 0x3a3a30, legs: 0x4c4a3c,
        desc: 'Elite squad with Stinger missiles that home on aircraft.', gun: { kind: 'bullet', dmg: 7, rate: 0.09, range: 320, vel: 560, spread: 0.025 },
        alt: { kind: 'aam', dmg: 110, splash: 12, cd: 7, vel: 230, range: 1000, turn: 2.4, label: 'Stinger Missiles' } },
      cn: { id: 'plasf', name: 'PLA Special Forces', o: { uni: 0x3f5038, helm: 0x34422e, legs: 0x36442f } } },
    { id: 'himars', base: 'priest', shop: 'Land', after: 'priest',
      o: { tier: 4, name: 'M142 HIMARS', model: 'launcher', kind: 'himars', cost: 1500, aiCost: 850, hp: 340, speed: 26, turn: 1.3, crew: 3,
        desc: 'Rocket artillery truck. Fires guided rockets at very long range.', gunLabel: 'Guided rockets',
        gun: { kind: 'shell', dmg: 210, splash: 30, rate: 4.5, range: 980, vel: 340 } },
      cn: { id: 'phl16', name: 'PHL-16 Rocket Launcher' } },
    { id: 'patriot', base: 'halftrack', shop: 'Land', after: 'himars',
      o: { tier: 4, name: 'Patriot Battery', model: 'launcher', kind: 'patriot', cost: 1400, aiCost: 800, hp: 360, speed: 18, turn: 1.0, crew: 4,
        desc: 'Long-range air defence. Heavy surface-to-air missiles reach far across the sky.',
        alt: { kind: 'aam', dmg: 200, splash: 18, cd: 6, vel: 300, range: 2200, turn: 2.0, label: 'Patriot Missiles' } },
      cn: { id: 'hq9', name: 'HQ-9 SAM Battery' } },
    { id: 'lcs', base: 'pt', shop: 'Sea', after: 'pt',
      o: { tier: 2, name: 'Freedom Littoral Ship', modern: 1, turrets: [1, 0], vls: 1, cost: 800, aiCost: 500, hp: 620, speed: 40, turn: 0.75, len: 40, beam: 8, crew: 70, camDist: 58, camH: 18, radius: 7, armor: 1,
        desc: 'Fast coastal warship. 57mm gun, torpedoes and depth charges.', gunLabel: 'Main guns',
        gun: { kind: 'shell', dmg: 45, splash: 8, rate: 0.7, range: 560, vel: 420 }, aa: { dmg: 4, rate: 0.2, range: 320 } },
      cn: { id: 't056', name: 'Type 056 Corvette' } },
    { id: 'ffg62', base: 'ward', shop: 'Sea', after: 'lcs',
      o: { tier: 3, name: 'Constellation Frigate', modern: 1, turrets: [1, 0], vls: 2, cost: 1400, aiCost: 800, hp: 1100, speed: 26, len: 60, beam: 8, crew: 200,
        desc: 'Guided-missile frigate. Sub hunter with a strong AA screen.', aa: { dmg: 6, rate: 0.13, range: 420 } },
      cn: { id: 't054', name: 'Type 054A Frigate' } },
    { id: 'ohio', base: 'gato', shop: 'Sea', after: 'gato',
      o: { tier: 4, name: 'Ohio-class SSGN', modern: 1, cost: 2200, aiCost: 1300, max: 1, hp: 1100, speed: 19, turn: 0.4, len: 72, beam: 8, crew: 155, camDist: 80, camH: 22, radius: 7,
        desc: 'Huge guided-missile submarine. Dive (C) to vanish; heavy torpedoes reload fast.',
        alt: { kind: 'torpedo', dmg: 560, splash: 14, cd: 3.5, label: 'Heavy torpedoes' } },
      cn: { id: 't096', name: 'Type 096 Sub' } }
  ]
};

// ---------------------------------------------------------------- Warlords: everyone for themselves
// A round continent with each warlord's base on its coast, evenly spaced so nobody is closer to the middle than
// anyone else. Every warlord starts with two points of their own (the Keep inland of their base and the Roads off
// its harbour). Between each pair of neighbours there is a border point on land and one at sea, and in the middle
// stands the Citadel: three points on a hill that score fastest of all. A point can be captured by whoever holds
// one of the points listed in its `from` (and a warlord can always retake their own two). Built for n warlords
// (2 to 8): the battlefield is laid out in battlefield coordinates and stored as longitude / latitude like the
// other theatres (the box below maps one degree to 700 units both ways).
const WAR_COLOURS = ['Blue', 'Red', 'Green', 'Gold', 'Purple', 'Orange', 'Teal', 'Pink'];
const WAR_CSS = ['#3f7dff', '#f04a3c', '#3fbf4f', '#f2c42e', '#a35ae8', '#ff8a2a', '#2ec4c9', '#f06ab4'];
const WAR_HEX = WAR_CSS.map(c => parseInt(c.slice(1), 16));
function warTheatre(n) {
  const R = 3000, LAT1 = 20 * 3750 / 7000;
  const L = (x, z) => [+((x / 7000 + 1) * 10).toFixed(4), +(LAT1 * (0.5 - z / 7500)).toFixed(4)];
  const at = (th, rad, tan) => L(Math.cos(th) * rad - Math.sin(th) * (tan || 0), Math.sin(th) * rad + Math.cos(th) * (tan || 0));
  const ang = t => Math.PI + t * 2 * Math.PI / n, mid = t => ang(t) + Math.PI / n;
  // the coastline: a circle, gently wobbling, a little further out behind each base
  const coast = [];
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * 2 * Math.PI, k = 1 + 0.025 * Math.sin(a * 5 + 1) + 0.02 * Math.sin(a * 9 + 4);
    coast.push(L(Math.cos(a) * R * k, Math.sin(a) * R * k));
  }
  const land = [coast];
  // a few rocky islets in the open sea east and west, with no points on them: room for ships and aircraft
  [[-5300, -1700], [-5600, 1500], [5300, 1700], [5600, -1500], [-4700, -100], [4700, 100]].forEach(([x, z], i) =>
    land.push(islandBlob(L(x, z), 0.35 + (i % 3) * 0.08, 0.22, i * 0.7, 71 + i * 3)));
  const terrain = [['hill', ...L(0, 0), 620], ['mtn', ...L(0, 0), 230], ['forest', ...L(0, 0), 900]];
  for (let t = 0; t < n; t++) {
    terrain.push(['forest', ...at(mid(t), 1150), 330], ['hill', ...at(mid(t), 2650), 260]);
    if (n <= 5) terrain.push(['forest', ...at(ang(t), 1150, 500), 220], ['forest', ...at(ang(t), 1150, -500), 220]);
  }
  // capture points: 0..n-1 the Keeps, n..2n-1 the Roads, then the borders on land and at sea, then the Citadel
  const keep = t => t, roads = t => n + t, bland = t => 2 * n + t, bsea = t => 3 * n + t, cit = i => 4 * n + i, pts = [];
  const prev = t => (t + n - 1) % n, next = t => (t + 1) % n;
  const cits = [0, 1, 2].map(cit), borders = [...Array(n).keys()].map(bland), keeps = [...Array(n).keys()].map(keep);
  for (let t = 0; t < n; t++) pts.push({ name: WAR_COLOURS[t] + ' Keep', p: at(ang(t), 1600), home: t, from: [bland(prev(t)), bland(t)] });
  for (let t = 0; t < n; t++) pts.push({ name: WAR_COLOURS[t] + ' Roads', p: at(ang(t), 3420), sea: true, home: t, from: n > 2 ? [bsea(prev(t)), bsea(t)] : [bsea(0), bsea(1)] });
  for (let t = 0; t < n; t++) pts.push({ name: n > 2 ? `${WAR_COLOURS[t]}-${WAR_COLOURS[next(t)]} Pass` : ['North Pass', 'South Pass'][t], p: at(mid(t), n > 2 ? 2000 : 1500), from: [keep(t), keep(next(t)), ...cits] });
  for (let t = 0; t < n; t++) pts.push({ name: n > 2 ? `${WAR_COLOURS[t]}-${WAR_COLOURS[next(t)]} Strait` : ['North Strait', 'South Strait'][t], p: at(mid(t), 3420), sea: true, from: n > 2 ? [roads(t), roads(next(t))] : [roads(0), roads(1)] });
  ['Citadel Gate', 'Citadel Tower', 'Citadel Hall'].forEach((name, i) => pts.push({ name, p: at(-Math.PI / 2 + i * 2 * Math.PI / 3, 430), cit: true, from: [...keeps, ...borders, ...cits.filter(c => c !== cit(i))] }));
  const T = [...Array(n).keys()], out = t => [Math.cos(ang(t)), Math.sin(ang(t))];
  return {
    id: 'war' + n, title: 'Warlords', place: 'Warlords', blurb: `Everyone for themselves · ${n} warlords`, war: { n },
    box: { lon0: 0, lon1: 20, lat0: 0, lat1: LAT1 },
    face: T.map(t => Math.cos(ang(t)) > 0 ? -1 : 1),
    base: T.map(t => at(ang(t), 2150)), airport: T.map(t => at(ang(t), 2560)),
    home: T.map(t => ({ depot: at(ang(t), 1750, 380), airDepot: at(ang(t), 3600, -300), dockFrom: at(ang(t), 2150, -260), dockDir: out(t),
      dockYaw: Math.atan2(out(t)[0], out(t)[1]), seaFar: at(ang(t), 3550, 520) })),
    land, terrain, points: pts,
    sectors: [], laneTags: ['', '', ''], lanes: [[], [], []],
    homeland: { name: 'Home', names: [], nodes: [] }, invade: { col: 0, lane: 1, fromSea: false }, islands: false,
    start: () => -1, homeStart: [], seasons: EU_SEASONS, grid: [2, 2], labels: [], hqLabels: T.map(t => WAR_COLOURS[t] + ' HQ'),
    sides: { adj: WAR_COLOURS.slice(0, n), pl: WAR_COLOURS.slice(0, n).map(c => c + ' army') },
    str: { goal: `Warlords: ${n} armies, everyone for themselves. Hold points to score; the three Citadel points in the middle score fastest. Whoever has the most points when the clock runs out wins. Pick your base or a point you hold on the map, then choose a vehicle.`,
      advance: 'Your banner flies over another point', retreat: 'A rival has taken one of your points' },
    help: `<b>Warlords.</b> ${n} warlords, each with a base, a Keep and the Roads off their harbour. Between neighbours lie a Pass on land and a Strait at sea, and in the middle the Citadel. You can capture a point next to one you hold (the lines on the map), and you can always retake your own two. Every point you hold scores; the Citadel scores five times as fast. Destroying people's vehicles and taking points scores too, and a warlord who has lost every point has an open headquarters: sack it for a big bonus. It is rebuilt a minute later. Most score when the clock runs out wins.<br>`,
    names: {}
  };
}
const THEATRES = { eu: EU_THEATRE, pac: PAC_THEATRE, mod: MOD_THEATRE };
// the Warlords maps are made when asked for: warN with N warlords
function warN(id) { const m = /^war([2-8])$/.exec(id || ''); return m ? +m[1] : 0; }
function theatreOf(id) { return THEATRES[id] || (warN(id) ? warTheatre(warN(id)) : null); }

// ---------------------------------------------------------------- custom maps (built in editor.html)
// A custom map starts as a copy of one of the theatres above (its units, seasons and sides) with its own coastline,
// terrain, capture points, headquarters and sector names. They are kept in localStorage and played as 'map-<id>'.
const MAPS_KEY = 'frontline1944.maps';
function loadMaps() { try { const m = JSON.parse(localStorage.getItem(MAPS_KEY)); return Array.isArray(m) ? m.filter(x => x && x.id && THEATRES[x.base]) : []; } catch (e) { return []; } }
function saveMaps(list) { localStorage.setItem(MAPS_KEY, JSON.stringify(list)); }
function sideAdj(B, t) { return (B.sides ? B.sides.adj : ['Allied', 'Axis'])[t]; }
// a new map record from a theatre: its markers and terrain are copied so the map stands on its own.
// start: 'coast' keeps the real coastline, 'sea' starts with open water, 'land' with solid ground
function newMapFrom(baseId, name, start) {
  const B = THEATRES[baseId], cp = v => JSON.parse(JSON.stringify(v)), g = B.box;
  const m = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || 'New map', base: baseId, v: 1,
    coast: start === 'coast', stamps: start === 'coast' ? cp(B.terrain || []) : [],
    lanes: cp(B.lanes), homeNodes: cp(B.homeland.nodes), homeName: B.homeland.name, homeNames: cp(B.homeland.names),
    hq: cp(B.base), airport: cp(B.airport), home: cp(B.home), sectors: cp(B.sectors),
    pointNames: B.sectors.map((n, c) => [0, 1, 2].map(l => (B.pointNames && B.pointNames[c][l]) || n + B.laneTags[l])) };
  if (start === 'land') m.stamps.push(['land', (g.lon0 + g.lon1) / 2, (g.lat0 + g.lat1) / 2, 20000]);
  return m;
}
function customTheatre(m) {
  const B = THEATRES[m.base];
  return Object.assign({}, B, {
    id: 'map-' + m.id, baseId: B.id, custom: m, title: m.name, blurb: 'Custom map · ' + B.title,
    land: m.coast ? B.land : [], terrain: m.stamps || [], labels: m.coast ? B.labels : [],
    lanes: m.lanes, homeland: { name: m.homeName || B.homeland.name, names: m.homeNames || B.homeland.names, nodes: m.homeNodes },
    base: m.hq, airport: m.airport, home: m.home, sectors: m.sectors, pointNames: m.pointNames,
    hqLabels: [sideAdj(B, 0) + ' HQ', sideAdj(B, 1) + ' HQ'],
    str: { goal: `${m.name}: a custom battlefield. Push the front line sector by sector until the enemy headquarters falls. Click a sector on the map, then choose a vehicle.`,
      advance: 'The front line moves forward', retreat: 'The enemy pushes the front line back' }
  });
}
let THEATRE_ID = 'eu', CUSTOM_MAP = null;
// a custom map someone else is hosting an online battle on (handed over by the game server, kept for this tab only)
function netMap(id) {
  try { if (!/[?&]join=/.test(location.search)) return null; const m = JSON.parse(sessionStorage.getItem('frontline1944.netmap')); return m && 'map-' + m.id === id && THEATRES[m.base] ? m : null; } catch (e) { return null; }
}
// Without a browser (the game server) the theatre is set before this file loads: FRONTLINE_FRONT = 'eu' / 'pac' /
// 'mod', or FRONTLINE_MAP = a custom map record from the map builder.
if (typeof FRONTLINE_MAP !== 'undefined' && FRONTLINE_MAP && THEATRES[FRONTLINE_MAP.base]) { CUSTOM_MAP = FRONTLINE_MAP; THEATRE_ID = CUSTOM_MAP.base; }
else if (typeof FRONTLINE_FRONT !== 'undefined' && theatreOf(FRONTLINE_FRONT)) THEATRE_ID = FRONTLINE_FRONT;
else try {
  const q = new URLSearchParams(location.search).get('front'), s = q || localStorage.getItem(FRONT_KEY);
  if (s && s.startsWith('map-')) CUSTOM_MAP = loadMaps().find(m => 'map-' + m.id === s) || netMap(s);
  if (CUSTOM_MAP) THEATRE_ID = CUSTOM_MAP.base;
  else if (s && theatreOf(s)) THEATRE_ID = s;
  if (q && (theatreOf(q) || CUSTOM_MAP)) localStorage.setItem(FRONT_KEY, q);
} catch (e) { }
const TH = CUSTOM_MAP ? customTheatre(CUSTOM_MAP) : theatreOf(THEATRE_ID);
function switchTheatre(id) {
  if (!theatreOf(id) && !(id.startsWith('map-') && loadMaps().some(m => 'map-' + m.id === id))) return;
  try { localStorage.setItem(FRONT_KEY, id); } catch (e) { }
  const q = new URLSearchParams(location.search); q.delete('front'); q.set('front', id);
  location.replace(location.pathname + '?' + q.toString());
}

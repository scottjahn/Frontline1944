'use strict';
// ---------- theatres of war ----------
// Each theatre is one edition of the campaign: its own map, chain of sectors, home bases, seasons and unit names.
// Everything here is in longitude / latitude (east-positive; the Pacific uses 0..360 so it does not wrap at the
// date line). defs.js turns it into battlefield coordinates. Pick one with ?front=eu|pac or from the menu.
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
  help: '<b>The campaign.</b> Seven sectors along the Channel and North Sea coast lie between your headquarters in England and theirs in Berlin, each with two points on land and one at sea. It is 1940 and the Allies are nearly beaten: only Brest is still in Allied hands and the Axis have a foothold at Dover. Destroy a point\'s command post, then hold the ground with tanks and infantry (or the water with warships) to capture it. Points fall in order, so the front line moves one step at a time. A headquarters can only be attacked once its home sector is breached. England has three points of its own (Dover, London, Southampton): while the Axis hold Calais they ferry troops across to Dover, and if all three fall the Allied headquarters is open.<br>',
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
function pacLanes() {
  const lanes = [[PAC_HOME_LANES[0][0]], [PAC_HOME_LANES[0][1]], [PAC_HOME_LANES[0][2]]];
  let prev = [202, 21.3];                                       // Pearl Harbor
  for (const s of PAC_ISLANDS) {
    const k = s.rx * 0.46, dx = Math.cos(s.rot) * k, dy = Math.sin(s.rot) * k;
    let a = [s.c[0] + dx, s.c[1] + dy], b = [s.c[0] - dx, s.c[1] - dy];
    if (Math.hypot(a[0] - prev[0], a[1] - prev[1]) > Math.hypot(b[0] - prev[0], b[1] - prev[1])) [a, b] = [b, a];
    lanes[0].push(b); lanes[1].push(a); lanes[2].push(s.sea);     // the landing beach faces the way the Allies come from
    prev = s.c;
  }
  for (let l = 0; l < 3; l++) lanes[l].push(PAC_HOME_LANES[1][l]);
  return lanes;
}
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
  help: '<b>The campaign.</b> Seven island battlegrounds lie between Pearl Harbor and Tokyo, each with two points ashore and one at sea. It is December 1941 and the Allies are nearly beaten: only Midway still holds and Japanese troops have landed on Hawaii. Ground forces cannot drive from island to island: pick the next island on the map to make an amphibious landing on its beach (landing ships and paratroopers go in the same way). Destroy a point\'s command post, then hold the ground (or the water with warships) to capture it. A headquarters can only be attacked once its home sector is breached. Hawaii has three points of its own (Haleiwa, Honolulu, Hickam Field): while Japan holds Wake its landing craft come ashore at Haleiwa, and if all three fall Pearl Harbor is open.<br>',
  names: {
    spitfire: 'F4F Wildcat', mustang: 'F6F Hellcat', troops: 'Marine Rifle Squad',
    bf109: 'A6M Zero', fw190: 'Ki-84 Hayate', bf110: 'Ki-45 Toryu', fi167: 'B5N Kate', fa223: 'Ka-1 Autogyro', ju88: 'G4M Betty', he111: 'G8N Renzan',
    ju52: 'Ki-57 Topsy', me323: 'Ku-7 Manazuru', me264: 'G10N Fugaku',
    grenadier: 'Imperial Rifle Squad', kubel: 'Type 95 Kurogane', flakwagen: 'Type 98 AA Half-track', panzer4: 'Type 97 Chi-Ha', wespe: 'Type 4 Ho-Ro', tiger: 'Type 4 Chi-To', opel: 'Isuzu Type 94',
    z23: 'Fubuki Destroyer', sboot: 'Gyoraitei', uboat: 'I-400 Submarine', hipper: 'Takao Cruiser', bismarck: 'Nagato', zeppelin: 'Akagi', tirpitz: 'Yamato',
    freighter: 'Maru Freighter', mfp: 'Daihatsu Landing Craft'
  }
};

const THEATRES = { eu: EU_THEATRE, pac: PAC_THEATRE };
let THEATRE_ID = 'eu';
try {
  const q = new URLSearchParams(location.search).get('front'), s = q || localStorage.getItem(FRONT_KEY);
  if (s && THEATRES[s]) THEATRE_ID = s;
  if (q && THEATRES[q]) localStorage.setItem(FRONT_KEY, q);
} catch (e) { }
const TH = THEATRES[THEATRE_ID];
function switchTheatre(id) {
  if (!THEATRES[id]) return;
  try { localStorage.setItem(FRONT_KEY, id); } catch (e) { }
  const q = new URLSearchParams(location.search); q.delete('front'); q.set('front', id);
  location.replace(location.pathname + '?' + q.toString());
}

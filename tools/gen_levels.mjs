/**
 * Cavern level generator.
 *
 * Produces data/levels.json - the single source of truth consumed by BOTH
 * blender/build_cavern.py (geometry) and src/game/Level.js (collision, secrets).
 * Output is baked, so the geometry in the .glb and the collision grid in the
 * browser can never drift apart.
 *
 * Pipeline per level:
 *   1. random fill -> cellular-automata smoothing  = organic cave shape
 *   2. flood fill  -> largest region is "main", everything else is a pocket
 *   3. pockets big enough become SECRET ROOMS, joined to main by one `S` tile
 *   4. features (spawn, stairs, fuel, crystals, treasure) placed by distance
 *
 * Tiles:  ' ' void  '#' rock  '.' floor  'S' secret wall  'P' spawn
 *         '>' stairs down  '<' stairs up  'F' fuel cache  '*' crystal  'T' treasure
 */

const W = 40, H = 32;

// ---------------------------------------------------------------- rng
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- gen
function genCave(rnd, fillPct, steps) {
  let g = [];
  for (let y = 0; y < H; y++) {
    g[y] = [];
    for (let x = 0; x < W; x++) {
      const edge = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
      g[y][x] = edge || rnd() < fillPct ? 1 : 0; // 1 = rock
    }
  }
  for (let s = 0; s < steps; s++) {
    const n = g.map((r) => r.slice());
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        let c = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            c += g[y + dy][x + dx];
          }
        n[y][x] = c > 4 ? 1 : c < 4 ? 0 : g[y][x];
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) n[y][x] = 1;
      }
    }
    g = n;
  }
  return g;
}

/** Label connected open regions (4-way). Returns {labels, regions:[[{x,y}]]} */
function regions(g) {
  const labels = g.map((r) => r.map(() => -1));
  const out = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y][x] !== 0 || labels[y][x] !== -1) continue;
      const id = out.length, cells = [], stack = [[x, y]];
      labels[y][x] = id;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push({ x: cx, y: cy });
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (g[ny][nx] === 0 && labels[ny][nx] === -1) {
            labels[ny][nx] = id;
            stack.push([nx, ny]);
          }
        }
      }
      out.push(cells);
    }
  }
  return { labels, regions: out };
}

/** BFS distance field over open tiles from a set of sources. */
function distanceField(g, sources) {
  const d = g.map((r) => r.map(() => Infinity));
  const q = [];
  for (const s of sources) { d[s.y][s.x] = 0; q.push(s); }
  for (let i = 0; i < q.length; i++) {
    const { x, y } = q[i];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (g[ny][nx] === 0 && d[ny][nx] === Infinity) {
        d[ny][nx] = d[y][x] + 1;
        q.push({ x: nx, y: ny });
      }
    }
  }
  return d;
}

/**
 * Deliberately carve a secret room into solid rock beside the main cave.
 *
 * CA smoothing reliably merges all open space into one blob, so natural sealed
 * pockets are rare - secrets cannot be left to chance. The room is only valid
 * if it is UNREACHABLE while its `S` wall is treated as solid, so the carve is
 * verified before it is kept and rolled back otherwise.
 */
function carveSecretRoom(g, rnd, radius) {
  const inB = (x, y) => x > 1 && y > 1 && x < W - 2 && y < H - 2;
  const disc = (cx, cy, r) => {
    const o = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r) o.push({ x: cx + dx, y: cy + dy });
    return o;
  };

  // current main cave, recomputed each call (earlier carves changed the map)
  const { labels, regions: regs } = regions(g);
  if (!regs.length) return null;
  let mainId = 0;
  regs.forEach((r, i) => { if (r.length > regs[mainId].length) mainId = i; });
  const isMain = (x, y) => inB(x, y) && labels[y][x] === mainId;
  const touchesMain = (x, y) =>
    [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => isMain(x + dx, y + dy));

  // candidate centres: the room disc AND a one-tile buffer ring must be solid
  // rock, so carving cannot break straight through into the open cave.
  const centres = [];
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++)
      if (disc(x, y, radius + 1).every((c) => inB(c.x, c.y) && g[c.y][c.x] === 1))
        centres.push({ x, y });
  for (let i = centres.length - 1; i > 0; i--) {         // shuffle
    const j = Math.floor(rnd() * (i + 1));
    [centres[i], centres[j]] = [centres[j], centres[i]];
  }

  for (const centre of centres) {
    const room = disc(centre.x, centre.y, radius);

    // BFS out through rock. A tunnel tile may never touch the main cave -
    // only the terminal tile may, and that one stays solid as the `S` wall.
    const key = (x, y) => y * W + x;
    const prev = new Map();
    const q = room.map((c) => ({ ...c }));
    const seen = new Set(q.map((c) => key(c.x, c.y)));
    let hit = null;
    for (let i = 0; i < q.length && !hit; i++) {
      const { x, y } = q[i];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inB(nx, ny) || seen.has(key(nx, ny)) || g[ny][nx] !== 1) continue;
        seen.add(key(nx, ny));
        prev.set(key(nx, ny), { x, y });
        if (touchesMain(nx, ny)) { hit = { x: nx, y: ny }; break; }
        q.push({ x: nx, y: ny });
      }
    }
    if (!hit) continue;

    const tunnel = [];
    let cur = prev.get(key(hit.x, hit.y));
    const inRoom = (c) => room.some((r) => r.x === c.x && r.y === c.y);
    while (cur && !inRoom(cur)) { tunnel.push(cur); cur = prev.get(key(cur.x, cur.y)); }
    if (tunnel.length > 6) continue;                     // too deep to feel fair

    // ---- carve, then verify the room really is sealed behind `hit`
    const carved = [...room, ...tunnel];
    for (const c of carved) g[c.y][c.x] = 0;

    const after = regions(g);
    const roomLabel = after.labels[centre.y][centre.x];
    let mainAfter = 0;
    after.regions.forEach((r, i) => { if (r.length > after.regions[mainAfter].length) mainAfter = i; });
    if (roomLabel !== mainAfter && after.regions[roomLabel]) {
      return { secret: hit, room: after.regions[roomLabel] };  // sealed - keep it
    }
    for (const c of carved) g[c.y][c.x] = 1;             // leaked - roll back
  }
  return null;
}

function buildLevel(seed, opts) {
  const rnd = mulberry32(seed);
  let g = genCave(rnd, opts.fill, 5);
  const { labels, regions: regs } = regions(g);
  if (!regs.length) throw new Error(`seed ${seed}: no open space`);

  // main region = biggest; everything else is a pocket candidate
  let mainId = 0;
  regs.forEach((r, i) => { if (r.length > regs[mainId].length) mainId = i; });

  const secrets = [];   // {x,y} wall tiles that become `S`
  const secretRooms = []; // pocket cell lists kept as secret rooms

  for (let i = 0; i < regs.length; i++) {
    if (i === mainId) continue;
    const pocket = regs[i];
    if (pocket.length < opts.minSecret || pocket.length > opts.maxSecret) {
      for (const c of pocket) g[c.y][c.x] = 1; // too small/big -> fill in
      continue;
    }
    // find a single rock tile touching both this pocket and the main region
    const joins = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (g[y][x] !== 1) continue;
        let touchPocket = false, touchMain = false;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const l = labels[y + dy][x + dx];
          if (l === i) touchPocket = true;
          else if (l === mainId) touchMain = true;
        }
        if (touchPocket && touchMain) joins.push({ x, y });
      }
    }
    if (!joins.length) {
      for (const c of pocket) g[c.y][c.x] = 1; // unreachable -> fill in
      continue;
    }
    secrets.push(joins[Math.floor(rnd() * joins.length)]);
    secretRooms.push(pocket);
  }

  // --- deliberately carve the remaining secrets we still owe the player
  for (let n = secrets.length; n < opts.secrets; n++) {
    const r = (n === 0 ? [3, 2] : [2, 3])
      .reduce((acc, rad) => acc || carveSecretRoom(g, rnd, rad), null);
    if (!r) break;
    secrets.push(r.secret);
    secretRooms.push(r.room);
  }

  // ------------------------------------------------------------ features
  // re-label: carving changed the map, and `main` must include the new tunnels
  const relabel = regions(g);
  let mid = 0;
  relabel.regions.forEach((r, i) => { if (r.length > relabel.regions[mid].length) mid = i; });
  const main = relabel.regions[mid];
  const chars = g.map((r) => r.map((v) => (v === 1 ? '#' : '.')));
  const place = (c, ch) => { chars[c.y][c.x] = ch; };

  const secretCells = new Set(secretRooms.flat().map((c) => c.y * W + c.x));
  const publicCells = main.filter((c) => !secretCells.has(c.y * W + c.x));
  const spawn = publicCells[Math.floor(rnd() * publicCells.length)];
  const dFromSpawn = distanceField(g, [spawn]);

  // stairs: the reachable main tile furthest from spawn
  let far = spawn, farD = -1;
  for (const c of publicCells) {
    const d = dFromSpawn[c.y][c.x];
    if (d !== Infinity && d > farD) { farD = d; far = c; }
  }

  // fuel caches: greedy furthest-point sampling so they are spread out
  const fuel = [];
  const cand = publicCells.filter((c) => c !== spawn && c !== far);
  let dField = distanceField(g, [spawn, far]);
  for (let n = 0; n < opts.fuel; n++) {
    let best = null, bestD = -1;
    for (const c of cand) {
      const d = dField[c.y][c.x];
      if (d !== Infinity && d > bestD && chars[c.y][c.x] === '.') { bestD = d; best = c; }
    }
    if (!best) break;
    fuel.push(best);
    place(best, 'F');
    dField = distanceField(g, [spawn, far, ...fuel]);
  }

  // reward inside each secret room: treasure in the largest, fuel elsewhere
  secretRooms.sort((a, b) => b.length - a.length);
  secretRooms.forEach((pocket, idx) => {
    const open = pocket.filter((c) => g[c.y][c.x] === 0 && chars[c.y][c.x] === '.');
    if (!open.length) return;
    const c = open[Math.floor(open.length / 2)];
    place(c, idx === 0 ? 'T' : 'F');
  });

  // crystals: ambient glow, scattered on open floor away from other features
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < opts.crystals; tries++) {
    const c = publicCells[Math.floor(rnd() * publicCells.length)];
    if (chars[c.y][c.x] !== '.') continue;
    if (dFromSpawn[c.y][c.x] < 6) continue;
    place(c, '*');
    placed++;
  }

  for (const s of secrets) chars[s.y][s.x] = 'S';
  place(spawn, opts.entry);
  place(far, opts.exit);

  return {
    grid: chars.map((r) => r.join('')),
    stats: {
      floor: main.length,
      secrets: secrets.length,
      secretRooms: secretRooms.map((p) => p.length),
      fuel: fuel.length,
      span: farD,
    },
  };
}

// ---------------------------------------------------------------- levels
const SPEC = [
  { name: 'The Threshold', seed: 20260906, fill: 0.46, fuel: 4, crystals: 10, secrets: 2,
    minSecret: 6, maxSecret: 40, entry: 'P', exit: '>', ambient: '#1a2230', fog: 0.055 },
  { name: 'The Weeping Gallery', seed: 771233, fill: 0.46, fuel: 4, crystals: 12, secrets: 3,
    minSecret: 6, maxSecret: 40, entry: '<', exit: '>', ambient: '#161d2b', fog: 0.065 },
  { name: 'The Deep Hollow', seed: 40518, fill: 0.47, fuel: 5, crystals: 14, secrets: 3,
    minSecret: 5, maxSecret: 40, entry: '<', exit: 'X', ambient: '#120f1c', fog: 0.08 },
];

const levels = SPEC.map((s, i) => {
  const { grid, stats } = buildLevel(s.seed, s);
  console.log(
    `L${i} ${s.name.padEnd(22)} floor=${String(stats.floor).padStart(3)} ` +
    `secrets=${stats.secrets} rooms=[${stats.secretRooms}] fuel=${stats.fuel} span=${stats.span}`
  );
  return { index: i, name: s.name, ambient: s.ambient, fog: s.fog, grid };
});

const doc = {
  tileSize: 2,          // world units per tile
  wallHeight: 3.2,
  levelDrop: 9,         // vertical world offset between levels
  legend: {
    ' ': 'void', '#': 'rock', '.': 'floor', 'S': 'secret wall',
    'P': 'spawn', '<': 'stairs up', '>': 'stairs down',
    'F': 'fuel cache', '*': 'crystal', 'T': 'secret treasure', 'X': 'the way out',
  },
  width: W, height: H,
  levels,
};

const { writeFileSync } = await import('node:fs');
writeFileSync('public/data/levels.json', JSON.stringify(doc, null, 2));
console.log(`\nwrote data/levels.json  (${W}x${H}, ${levels.length} levels)`);

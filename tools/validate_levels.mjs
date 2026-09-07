/**
 * Validates the cave generator the game actually runs.
 *
 * Caves are generated in the browser at load (`src/game/LevelGen.js`), so the
 * thing worth checking is not one committed grid but the GENERATOR: roll many
 * runs and assert the design invariants hold on every level of every one.
 *
 * The invariants are checked here INDEPENDENTLY of the generator's own
 * `validate()`. That is the point - if a bug in that check let a bad level
 * through, a validator that called it would agree with it.
 *
 *   node tools/validate_levels.mjs [runs]
 *
 * Exits non-zero on the first violation, printing the seed so it can be
 * reproduced with `generateLevels(seed)`.
 */
import { generateLevels } from '../src/game/LevelGen.js';

const RUNS = Number(process.argv[2] || 150);
const SOLID = new Set(['#', 'S', ' ']);

/** Progressive discoverability: exactly the fixpoint the player walks. */
function openableSecrets(g, W, H, entry, at) {
  const S = [];
  g.forEach((r, y) => r.forEach((c, x) => c === 'S' && S.push({ x, y })));
  const open = new Set();
  for (;;) {
    const seen = reach(g, W, H, entry, at, open);
    let progress = false;
    for (const s of S) {
      if (open.has(`${s.x},${s.y}`)) continue;
      const beside = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const nx = s.x + dx,
          ny = s.y + dy,
          c = at(nx, ny);
        return (
          seen[ny]?.[nx] &&
          (!SOLID.has(c) || (c === 'S' && open.has(`${nx},${ny}`)))
        );
      });
      if (beside) {
        open.add(`${s.x},${s.y}`);
        progress = true;
      }
    }
    if (!progress) return { total: S.length, open };
  }
}

function reach(g, W, H, entry, at, opened = null) {
  const seen = g.map((r) => r.map(() => false));
  const q = [entry];
  seen[entry.y][entry.x] = true;
  for (let i = 0; i < q.length; i++) {
    const { x, y } = q[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        c = at(nx, ny);
      const passable =
        !SOLID.has(c) ||
        (c === 'S' && (opened === null || opened.has(`${nx},${ny}`)));
      if (passable && !seen[ny]?.[nx]) {
        seen[ny][nx] = true;
        q.push({ x: nx, y: ny });
      }
    }
  }
  return seen;
}

function checkLevel(lv, label) {
  const g = lv.grid.map((r) => r.split(''));
  const H = g.length,
    W = g[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : g[y][x]);
  const find = (ch) => {
    const o = [];
    g.forEach((r, y) => r.forEach((c, x) => c === ch && o.push({ x, y })));
    return o;
  };
  const fail = (msg) => {
    throw new Error(`${label}: ${msg}`);
  };

  const entry = [...find('P'), ...find('<')];
  const exit = [...find('>'), ...find('X')];
  if (entry.length !== 1) fail(`entries=${entry.length}, want 1`);
  if (exit.length !== 1) fail(`exits=${exit.length}, want 1`);

  const floor = '.FT*P<>X'.split('').reduce((n, c) => n + find(c).length, 0);
  if (floor < 430 || floor > 760) fail(`floor=${floor}, want 430..760`);

  const closed = reach(g, W, H, entry[0], at, new Set()); // no secrets open
  const open = reach(g, W, H, entry[0], at); // all secrets open

  // the way onward must never itself be hidden
  if (!closed[exit[0].y][exit[0].x]) fail('the way onward is behind a secret');

  // ...but the level is not finishable until every secret is found, so every
  // secret has to be findable. See docs/adr/0003.
  const { total, open: openable } = openableSecrets(g, W, H, entry[0], at);
  if (total < 2) fail(`secrets=${total}, want >= 2`);
  if (openable.size !== total)
    fail(`${total - openable.size} of ${total} secrets can never be reached`);

  // at least one reward genuinely behind a secret, and none stranded
  let gated = 0;
  for (const r of [...find('T'), ...find('F')]) {
    if (!open[r.y][r.x])
      fail('a reward is unreachable even with every secret open');
    if (!closed[r.y][r.x]) gated++;
  }
  if (!gated) fail('no reward is gated behind a secret');
  return { floor, secrets: total };
}

let levels = 0;
const t0 = Date.now();
for (let i = 0; i < RUNS; i++) {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  let doc;
  try {
    doc = generateLevels(seed);
  } catch (e) {
    console.error(`generateLevels(${seed}) threw: ${e.message}`);
    process.exit(1);
  }
  for (const lv of doc.levels) {
    try {
      checkLevel(lv, `${lv.name} (seed ${seed})`);
      levels++;
    } catch (e) {
      console.error(`FAIL ${e.message}`);
      console.error(`reproduce: generateLevels(${seed})`);
      process.exit(1);
    }
  }
}
const ms = Date.now() - t0;
console.log(
  `ok  ${RUNS} runs / ${levels} levels, all invariants hold ` +
    `(${(ms / RUNS).toFixed(1)}ms per run)`,
);

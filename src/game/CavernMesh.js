import * as THREE from 'three';
import { Grid } from './Grid.js';

/**
 * Builds the cavern geometry in the browser, from the grid.
 *
 * A direct port of what blender/build_cavern.py used to bake into cavern.glb.
 * Moving it here is what lets the cave be different every run - and removes a
 * 2.4MB download, since ~24k triangles per level costs a few milliseconds to
 * generate and nothing to ship.
 *
 * The important structural idea survives the port: a shared CORNER LATTICE, so
 * neighbouring wall tops and floor cells seam instead of stepping, and secret
 * walls are built as separate meshes that share that lattice and the rock
 * material - genuinely indistinguishable until revealed.
 */

const WALL_SUB = 2; // wall lattice is 2x finer than the tile grid
const FLOOR_D = 0.75; // floor slab thickness
const BAND = [0.2, 0.95, 1.0]; // XY wander at base / waist / crown

/** Deterministic 0..1 hash - the same one Grid uses for floor heights. */
const hsh = Grid.hsh;

export function wallZ(cx, cy, wallHeight) {
  const x = cx / WALL_SUB,
    y = cy / WALL_SUB;
  // the per-vertex hash is the SMALLEST term: let it lead and the wall tops
  // become a field of shards rather than rock
  return (
    wallHeight +
    (hsh(cx, cy, 29) - 0.5) * 0.62 +
    Math.sin(x * 0.55 + y * 0.33) * 0.62 +
    Math.cos(x * 1.13 - y * 0.87) * 0.34 +
    Math.sin((x + y) * 2.1) * 0.11
  );
}

/** Accumulates triangles, then bakes a BufferGeometry. */
class Mesher {
  constructor() {
    this.pos = [];
  }
  tri(a, b, c) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }
  quad(a, b, c, d) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  get count() {
    return this.pos.length / 9;
  }
  geometry(smooth) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (smooth) {
      // merge coincident vertices so normals average across cells -> a rolling
      // floor rather than a quilt of flat facets
      const map = new Map();
      const idx = [];
      const verts = [];
      for (let i = 0; i < this.pos.length; i += 3) {
        const k = `${this.pos[i].toFixed(4)},${this.pos[i + 1].toFixed(4)},${this.pos[i + 2].toFixed(4)}`;
        let v = map.get(k);
        if (v === undefined) {
          v = verts.length / 3;
          map.set(k, v);
          verts.push(this.pos[i], this.pos[i + 1], this.pos[i + 2]);
        }
        idx.push(v);
      }
      const s = new THREE.BufferGeometry();
      s.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      s.setIndex(idx);
      s.computeVertexNormals();
      return s;
    }
    g.computeVertexNormals(); // non-indexed -> per-face normals, flat rock
    return g;
  }
}

/** Closed volume over a set of tiles: jittered top, flat bottom, skirt sides. */
function slab(
  m,
  grid,
  tiles,
  topFn,
  bottomY,
  { inset = 0, sub = 1, waist = false } = {},
) {
  const { tileSize: TS, W, H } = grid;
  const cells = new Set();
  for (const [tx, ty] of tiles)
    for (let j = 0; j < sub; j++)
      for (let i = 0; i < sub; i++)
        cells.add(`${tx * sub + i},${ty * sub + j}`);

  const cache = new Map();
  const V = (cx, cy, band) => {
    const k = `${cx},${cy},${band}`;
    let v = cache.get(k);
    if (v) return v;
    let x = (cx / sub - W / 2) * TS;
    let z = (cy / sub - H / 2) * TS;
    if (inset) {
      const amt = (inset * BAND[band]) / sub;
      x += (0.5 - hsh(cx, cy, 77 + band * 13)) * amt;
      z += (0.5 - hsh(cx, cy, 91 + band * 13)) * amt;
    }
    const y =
      band === 2
        ? topFn(cx, cy)
        : band === 1
          ? bottomY + (topFn(cx, cy) - bottomY) * 0.52
          : bottomY;
    v = [x, y, z];
    cache.set(k, v);
    return v;
  };

  for (const key of cells) {
    const [cx, cy] = key.split(',').map(Number);
    const c = [
      [cx, cy],
      [cx + 1, cy],
      [cx + 1, cy + 1],
      [cx, cy + 1],
    ];
    const crown = c.map(([a, b]) => V(a, b, 2));
    const base = c.map(([a, b]) => V(a, b, 0));
    m.quad(crown[3], crown[2], crown[1], crown[0]); // up
    m.quad(base[0], base[1], base[2], base[3]); // down
    const NB = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    for (let i = 0; i < 4; i++) {
      if (cells.has(`${cx + NB[i][0]},${cy + NB[i][1]}`)) continue;
      const a = c[i],
        b = c[(i + 1) % 4];
      if (waist) {
        const wa = V(a[0], a[1], 1),
          wb = V(b[0], b[1], 1);
        m.quad(V(a[0], a[1], 2), V(b[0], b[1], 2), wb, wa);
        m.quad(wa, wb, V(b[0], b[1], 0), V(a[0], a[1], 0));
      } else {
        m.quad(
          V(a[0], a[1], 2),
          V(b[0], b[1], 2),
          V(b[0], b[1], 0),
          V(a[0], a[1], 0),
        );
      }
    }
  }
}

// ---------------------------------------------------------------- decoration
function cone(m, cx, cy, cz, r, h, segs, tilt = 0) {
  const tip = [cx + tilt, cy + h, cz - tilt];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2,
      a1 = ((i + 1) / segs) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r];
    const p1 = [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r];
    m.tri(p0, p1, tip);
    m.tri(p1, p0, [cx, cy, cz]);
  }
}

function blob(m, cx, cy, cz, r, sy) {
  // a squashed octahedron: cheap rubble that still catches the torch
  const p = [
    [cx, cy + r * sy, cz],
    [cx, cy - r * sy * 0.4, cz],
    [cx + r, cy, cz],
    [cx, cy, cz + r],
    [cx - r, cy, cz],
    [cx, cy, cz - r],
  ];
  const F = [
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 5],
    [0, 5, 2],
    [1, 3, 2],
    [1, 4, 3],
    [1, 5, 4],
    [1, 2, 5],
  ];
  for (const [a, b, c] of F) m.tri(p[a], p[b], p[c]);
}

/**
 * @returns {{ group, secrets: Map<string, THREE.Mesh>, tris: number }}
 */
export function buildCavernLevel(grid, level, mats) {
  const { W, H, tileSize: TS } = grid;
  const wallHeight = grid.doc.wallHeight;
  const baseY = grid.levelY(level);
  const centre = (tx, ty) => [(tx - W / 2 + 0.5) * TS, (ty - H / 2 + 0.5) * TS];

  const floors = [],
    near = new Set(),
    secretTiles = [];
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const ch = grid.char(level, tx, ty);
      if (ch === 'S') {
        secretTiles.push([tx, ty]);
        continue;
      }
      if (ch === '#' || ch === ' ') continue;
      floors.push([tx, ty]);
      // rock is only built where it can be seen: within 2 tiles of floor
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const c = grid.char(level, tx + dx, ty + dy);
          if (c === '#' || c === ' ') near.add(`${tx + dx},${ty + dy}`);
        }
    }
  }
  const walls = [...near].map((k) => k.split(',').map(Number));

  const topWall = (cx, cy) => baseY + wallZ(cx, cy, wallHeight);
  const topFloor = (cx, cy) => baseY + Grid.cornerZ(cx, cy);

  const group = new THREE.Group();
  group.name = `Level_${level}`;
  let tris = 0;

  const mFloor = new Mesher();
  slab(mFloor, grid, floors, topFloor, baseY - FLOOR_D, {
    sub: Grid.FLOOR_SUB,
  });
  const floor = new THREE.Mesh(mFloor.geometry(true), mats.floor);
  floor.name = `L${level}_floor`;
  floor.receiveShadow = true;
  tris += mFloor.count;
  group.add(floor);

  const mRock = new Mesher();
  slab(mRock, grid, walls, topWall, baseY - FLOOR_D, {
    inset: 0.62,
    sub: WALL_SUB,
    waist: true,
  });
  const rock = new THREE.Mesh(mRock.geometry(false), mats.rock);
  rock.name = `L${level}_rock`;
  rock.castShadow = rock.receiveShadow = true;
  tris += mRock.count;
  group.add(rock);

  // each secret is its own mesh so one can be faded alone, but it shares the
  // lattice and the material with ordinary rock
  const secrets = new Map();
  for (const [tx, ty] of secretTiles) {
    const ms = new Mesher();
    slab(ms, grid, [[tx, ty]], topWall, baseY - FLOOR_D, {
      inset: 0.62,
      sub: WALL_SUB,
      waist: true,
    });
    const mesh = new THREE.Mesh(ms.geometry(false), mats.rock.clone());
    mesh.name = `L${level}_secret_${tx}_${ty}`;
    mesh.castShadow = mesh.receiveShadow = true;
    tris += ms.count;
    group.add(mesh);
    secrets.set(`${level}:${tx},${ty}`, mesh);
  }

  // ---- stalagmites and rubble
  const mDeco = new Mesher();
  for (const [tx, ty] of floors) {
    const [x, z] = centre(tx, ty);
    const y = grid.floorHeight(level, x, z);
    if (grid.char(level, tx, ty) === '.' && hsh(tx, ty, 300 + level) < 0.055) {
      let open = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        if (!grid.isSolid(level, tx + dx, ty + dy, null)) open++;
      if (open >= 3) {
        const h = 0.5 + hsh(tx, ty, 41) * 1.1;
        const r = 0.16 + hsh(tx, ty, 43) * 0.16;
        const off = (hsh(tx, ty, 45) - 0.5) * TS * 0.4;
        cone(
          mDeco,
          x + off,
          y - 0.05,
          z - off,
          r,
          h,
          6,
          (hsh(tx, ty, 47) - 0.5) * 0.2,
        );
      }
    }
    // rubble against the wall line: breaking that clean seam does more for the
    // illusion than any amount of extra detail on the walls
    let touching = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ])
      if (grid.isSolid(level, tx + dx, ty + dy, null)) touching++;
    if (touching && hsh(tx, ty, 500 + level) < 0.3) {
      const n = 1 + Math.floor(hsh(tx, ty, 510) * 2);
      for (let k = 0; k < n; k++) {
        const r = 0.2 + hsh(tx, ty, 520 + k) * 0.36;
        blob(
          mDeco,
          x + (hsh(tx, ty, 530 + k) - 0.5) * TS * 0.75,
          y + r * 0.42,
          z + (hsh(tx, ty, 540 + k) - 0.5) * TS * 0.75,
          r,
          0.62,
        );
      }
    }
  }
  if (mDeco.count) {
    const deco = new THREE.Mesh(mDeco.geometry(false), mats.rock);
    deco.name = `L${level}_deco`;
    deco.castShadow = deco.receiveShadow = true;
    tris += mDeco.count;
    group.add(deco);
  }

  // ---- crystals
  const mCry = new Mesher();
  for (const { tx, ty } of grid.find(level, '*')) {
    const [x, z] = centre(tx, ty);
    const y = grid.floorHeight(level, x, z);
    for (let k = 0; k < 3; k++) {
      const a = hsh(tx, ty, 50 + k) * Math.PI * 2;
      const d = 0.18 + hsh(tx, ty, 60 + k) * 0.42;
      const h = 0.38 + hsh(tx, ty, 70 + k) * 0.55;
      const r = 0.075 + hsh(tx, ty, 80 + k) * 0.06;
      cone(
        mCry,
        x + Math.cos(a) * d,
        y,
        z + Math.sin(a) * d,
        r,
        h,
        5,
        (hsh(tx, ty, 90 + k) - 0.5) * 0.25,
      );
    }
  }
  if (mCry.count) {
    const cry = new THREE.Mesh(mCry.geometry(false), mats.crystal);
    cry.name = `L${level}_crystal`;
    tris += mCry.count;
    group.add(cry);
  }

  return { group, secrets, tris };
}

export function cavernMaterials() {
  return {
    rock: new THREE.MeshStandardMaterial({ color: 0x16151a, roughness: 0.96 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x231d1a, roughness: 0.93 }),
    crystal: new THREE.MeshStandardMaterial({
      color: 0x388cb8,
      roughness: 0.25,
      emissive: 0x4db8f0,
      emissiveIntensity: 1.2,
    }),
  };
}

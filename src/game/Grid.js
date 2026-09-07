/**
 * The level grid: collision, tile queries, and floor height.
 *
 * This reads the SAME data/levels.json that blender/build_cavern.py used to
 * generate the meshes, so collision can never disagree with what is drawn.
 * The hash and floor_z functions below are deliberate ports of the Python
 * ones - the player must stand on the exact surface Blender built.
 */

// '>' is the way UP and is walkable - he climbs a staircase rather than
// stepping around a hole, so it no longer needs to be solid.
export const SOLID_CHARS = new Set(['#', ' ']);
export const SECRET = 'S';

export class Grid {
  /** Mirrors FLOOR_SUB in blender/build_cavern.py. */
  static FLOOR_SUB = 2;

  constructor(doc) {
    this.doc = doc;
    this.tileSize = doc.tileSize;
    this.drop = doc.levelDrop;
    this.W = doc.width;
    this.H = doc.height;
    this.levels = doc.levels.map((lv) => ({ ...lv, rows: lv.grid }));
  }

  char(level, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return '#';
    return this.levels[level].rows[ty][tx];
  }

  /** Secret walls are solid until revealed - that is the whole mechanic. */
  isSolid(level, tx, ty, revealed) {
    const c = this.char(level, tx, ty);
    if (c === SECRET)
      return !(revealed && revealed.has(`${level}:${tx},${ty}`));
    return SOLID_CHARS.has(c);
  }

  find(level, ch) {
    const out = [];
    const rows = this.levels[level].rows;
    for (let ty = 0; ty < this.H; ty++)
      for (let tx = 0; tx < this.W; tx++)
        if (rows[ty][tx] === ch) out.push({ tx, ty });
    return out;
  }

  // ------------------------------------------------------------ transforms
  tileToWorld(level, tx, ty) {
    return {
      x: (tx - this.W / 2 + 0.5) * this.tileSize,
      z: (ty - this.H / 2 + 0.5) * this.tileSize,
      y: level * this.drop,
    };
  }

  worldToTile(x, z) {
    return {
      tx: Math.floor(x / this.tileSize + this.W / 2),
      ty: Math.floor(z / this.tileSize + this.H / 2),
    };
  }

  /** He CLIMBS: level 0 is the deepest, each one above it is higher. */
  levelY(level) {
    return level * this.drop;
  }

  // ------------------------------------------------------------ floor height
  /** Port of hsh() in blender/lib-side build_cavern.py. Must match exactly. */
  static hsh(x, y, salt = 0) {
    let n =
      (Math.imul(x, 374761393) +
        Math.imul(y, 668265263) +
        Math.imul(salt, 2654435761)) >>>
      0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
  }

  /**
   * Port of floor_z(). Evaluated on a lattice FLOOR_SUB times finer than the
   * tile grid - must stay in sync with FLOOR_SUB in blender/build_cavern.py or
   * the player walks above or inside the ground that Blender built.
   */
  static cornerZ(cx, cy) {
    const x = cx / Grid.FLOOR_SUB,
      y = cy / Grid.FLOOR_SUB;
    return (
      (Grid.hsh(cx, cy, 11) - 0.5) * 0.15 +
      Math.sin(x * 0.62) * 0.125 +
      Math.cos(y * 0.51) * 0.125 +
      Math.sin((x + y) * 1.17) * 0.085 +
      Math.cos((x - y * 1.4) * 0.83) * 0.07
    );
  }

  /** Bilinear floor height at a world position, so the player hugs the ground. */
  floorHeight(level, x, z) {
    const S = Grid.FLOOR_SUB;
    const fx = (x / this.tileSize + this.W / 2) * S;
    const fz = (z / this.tileSize + this.H / 2) * S;
    const cx = Math.floor(fx),
      cy = Math.floor(fz);
    const u = fx - cx,
      v = fz - cy;
    const z00 = Grid.cornerZ(cx, cy),
      z10 = Grid.cornerZ(cx + 1, cy);
    const z01 = Grid.cornerZ(cx, cy + 1),
      z11 = Grid.cornerZ(cx + 1, cy + 1);
    const a = z00 * (1 - u) + z10 * u;
    const b = z01 * (1 - u) + z11 * u;
    return this.levelY(level) + a * (1 - v) + b * v;
  }

  /**
   * Is the player actually hidden behind rock, from a camera looking down the
   * given direction at `tanElev`?
   *
   * Marches the tile grid rather than raycasting the mesh: ~20 grid lookups
   * against ~12k triangle tests for the merged rock, and precise enough to
   * decide a visibility question. `dirX/dirZ` point FROM the player TOWARD the
   * camera, normalised on the XZ plane.
   */
  viewBlocked(level, x, z, dirX, dirZ, tanElev, headY, revealed, reach = 9) {
    const WALL_TOP = this.doc.wallHeight * 0.92; // crown, less a small margin
    const step = this.tileSize * 0.45;
    const baseY = this.levelY(level) + WALL_TOP;
    for (let d = step; d <= reach; d += step) {
      const t = this.worldToTile(x + dirX * d, z + dirZ * d);
      if (!this.isSolid(level, t.tx, t.ty, revealed)) continue;
      // the sight line climbs as it recedes toward an elevated camera
      if (baseY > headY + d * tanElev) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ collision
  /**
   * Slide a circle of `radius` from (x,z) by (dx,dz) against solid tiles.
   * Axis-separated so the player slides along walls instead of sticking.
   */
  moveCircle(level, x, z, dx, dz, radius, revealed) {
    const nx = this.resolveAxis(level, x + dx, z, radius, revealed, true, x);
    const nz = this.resolveAxis(level, nx, z + dz, radius, revealed, false, z);
    return { x: nx, z: nz };
  }

  resolveAxis(level, x, z, radius, revealed, isX, prev) {
    const ts = this.tileSize;
    const { tx, ty } = this.worldToTile(x, z);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = tx + ox,
          gy = ty + oy;
        if (!this.isSolid(level, gx, gy, revealed)) continue;
        const minX = (gx - this.W / 2) * ts,
          maxX = minX + ts;
        const minZ = (gy - this.H / 2) * ts,
          maxZ = minZ + ts;
        const cx = Math.max(minX, Math.min(x, maxX));
        const cz = Math.max(minZ, Math.min(z, maxZ));
        const ddx = x - cx,
          ddz = z - cz;
        if (ddx * ddx + ddz * ddz >= radius * radius) continue;
        // overlapping: back the moving axis out of this tile
        if (isX) {
          x =
            prev <= cx
              ? Math.min(x, minX - radius - 1e-4)
              : Math.max(x, maxX + radius + 1e-4);
        } else {
          z =
            prev <= cz
              ? Math.min(z, minZ - radius - 1e-4)
              : Math.max(z, maxZ + radius + 1e-4);
        }
      }
    }
    return isX ? x : z;
  }
}

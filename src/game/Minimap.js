/**
 * Fog-of-war minimap.
 *
 * Nothing is drawn until he has walked near it. The explored set is per level
 * and only ever grows, so the map is a record of where he has actually been -
 * which makes the ragged edge of the explored area the useful part: it is the
 * frontier, and it shows at a glance which way is still unexplored.
 *
 * Kept NORTH-UP rather than rotating with the camera. The camera can now be
 * pivoted freely, and a map that spins with it never lets you build a mental
 * picture of the cave; a fixed map plus a facing arrow does.
 */

const CELL = 8;               // canvas pixels per tile
const REVEAL = 3.4;           // tiles revealed around him as he walks

const COL = {
  // floor and wall need real separation in value or the map reads as one blob
  floor:      'rgba(224,196,158,0.52)',
  wall:       'rgba(16,15,20,0.95)',
  secret:     'rgba(127,212,255,0.85)',
  stairs:     'rgba(255,206,120,0.95)',
  exit:       'rgba(159,216,255,0.95)',
  ember:      'rgba(255,150,60,0.75)',
  player:     '#ffd9a1',
};

export class Minimap {
  constructor(grid, canvas) {
    this.grid = grid;
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.explored = grid.levels.map(() => new Uint8Array(grid.W * grid.H));
    this.dirty = true;
    this._lastDraw = 0;

    if (canvas) {
      canvas.width = grid.W * CELL;
      canvas.height = grid.H * CELL;
    }
  }

  /** Mark everything within REVEAL tiles of him as seen. */
  reveal(level, pos) {
    const { grid } = this;
    const seen = this.explored[level];
    if (!seen) return;
    const { tx, ty } = grid.worldToTile(pos.x, pos.z);
    const r = Math.ceil(REVEAL);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > REVEAL * REVEAL) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= grid.W || y >= grid.H) continue;
        const i = y * grid.W + x;
        if (!seen[i]) { seen[i] = 1; this.dirty = true; }
      }
    }
  }

  update(dt, level, pos, facing, cavern, props) {
    if (!this.ctx) return;
    this.reveal(level, pos);
    // redraw on new ground, and otherwise just often enough to move the arrow
    const now = performance.now();
    if (!this.dirty && now - this._lastDraw < 90) return;
    this._lastDraw = now;
    this.dirty = false;
    this.draw(level, pos, facing, cavern, props);
  }

  draw(level, pos, facing, cavern, props) {
    const { ctx, grid } = this;
    const seen = this.explored[level];
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // ---- the cave, only where he has been
    for (let ty = 0; ty < grid.H; ty++) {
      for (let tx = 0; tx < grid.W; tx++) {
        if (!seen[ty * grid.W + tx]) continue;
        const ch = grid.char(level, tx, ty);
        const solid = ch === '#' || ch === ' ' || ch === '>' ||
          (ch === 'S' && !cavern.revealed.has(`${level}:${tx},${ty}`));
        ctx.fillStyle = solid ? COL.wall : COL.floor;
        ctx.fillRect(tx * CELL, ty * CELL, CELL, CELL);
      }
    }

    const marker = (tx, ty, colour, size = 5) => {
      if (!seen[ty * grid.W + tx]) return;         // never spoil unseen ground
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(tx * CELL + CELL / 2, ty * CELL + CELL / 2, size, 0, Math.PI * 2);
      ctx.fill();
    };

    // ---- things worth walking back to, but only once he has seen them.
    // A way onward that is still sealed is not drawn at all: if the map showed
    // where the stairs were, the locked door would only be an inconvenience
    // rather than a reason to go and find the rest of the level.
    const sealed = props && props.isSealed(level);
    if (!sealed) {
      for (const { tx, ty } of grid.find(level, '>')) marker(tx, ty, COL.stairs, 4.5);
      for (const { tx, ty } of grid.find(level, 'X')) marker(tx, ty, COL.exit, 5);
    }
    for (const s of cavern.secrets.values()) {
      if (s.level === level && s.done) marker(s.tx, s.ty, COL.secret, 3.5);
    }
    if (props) {
      for (const it of props.items) {
        if (it.level !== level || it.taken) continue;
        if (it.spec.kind === 'ember' || it.spec.kind === 'treasure') {
          marker(it.tx, it.ty, COL.ember, 2.6);
        }
      }
    }

    // ---- him: a wedge, so the fixed map still tells you which way he faces
    const { tx, ty } = grid.worldToTile(pos.x, pos.z);
    const cx = (pos.x / grid.tileSize + grid.W / 2) * CELL;
    const cy = (pos.z / grid.tileSize + grid.H / 2) * CELL;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-facing);                 // model faces +Z; canvas +y is south
    ctx.fillStyle = COL.player;
    ctx.shadowColor = 'rgba(255,200,120,0.9)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(5.8, 6.2);
    ctx.lineTo(0, 3.2);
    ctx.lineTo(-5.8, 6.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Carry the explored set across a level change (each level has its own). */
  exploredCount(level) {
    const seen = this.explored[level];
    let n = 0;
    for (const v of seen) if (v) n++;
    return n;
  }
}

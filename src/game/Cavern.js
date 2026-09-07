import * as THREE from 'three';
import { applyCutaway } from './Cutaway.js';
import { buildCavernLevel, cavernMaterials } from './CavernMesh.js';

/**
 * The cavern meshes loaded from cavern.glb, plus the secret-passage state.
 *
 * Secret walls were exported as individually-named objects (`L0_secret_12_7`)
 * that share the rock material and the corner lattice, so they are genuinely
 * indistinguishable from ordinary rock until the torch gets close enough.
 */
export class Cavern {
  /** Built from the grid at load - see CavernMesh.js. No .glb involved. */
  constructor(grid) {
    this.grid = grid;
    this.root = new THREE.Group();
    this.levels = [];
    this.secrets = new Map();      // "level:tx,ty" -> {mesh, level, tx, ty, t}
    this.revealed = new Set();
    this.revealing = [];
    this.mats = cavernMaterials();
    this.tris = 0;

    for (const lv of grid.levels) {
      const { group, secrets, tris } = buildCavernLevel(grid, lv.index, this.mats);
      this.levels[lv.index] = group;
      this.root.add(group);
      this.tris += tris;
      for (const [key, mesh] of secrets) {
        const [, coords] = key.split(':');
        const [tx, ty] = coords.split(',').map(Number);
        this.secrets.set(key, { mesh, level: lv.index, tx, ty, t: 0, done: false });
      }
    }

    this.root.traverse((o) => {
      if (!o.isMesh) return;
      // Cutaway belongs on WALLS ONLY. Applied to the floor it punches a
      // dithered hole in the ground the player is standing on; applied to
      // crystals it eats the only other light source in the cave.
      if (/_rock$|_secret_/.test(o.name)) {
        if (Array.isArray(o.material)) o.material.forEach(applyCutaway);
        else applyCutaway(o.material);
      }
      if (o.name.includes('crystal')) o.castShadow = false;
    });
  }

  setActiveLevel(i) {
    this.levels.forEach((node, idx) => {
      if (!node) return;
      // Only the current level. The floor slab is solid everywhere now (the
      // old stair shaft was a hole you could see down through; it is a walkable
      // staircase since the game became a climb), so a neighbouring level is
      // never visible - it just costs draw calls and invites off-by-one bugs
      // like props hanging in the sky.
      node.visible = idx === i;
    });
  }

  /**
   * How many secrets this level holds, and how many he has opened. The way
   * onward is locked until these are equal, so this is the level's objective
   * and not just a statistic.
   */
  countOn(level) {
    let total = 0, found = 0;
    for (const s of this.secrets.values()) {
      if (s.level !== level) continue;
      total++;
      if (s.done) found++;
    }
    return { total, found, complete: total > 0 && found === total };
  }

  /**
   * Closest undiscovered secret on this level: distance AND bearing.
   * The bearing lets the character physically turn his head toward what the
   * torch is sensing, which reads far better than a HUD number.
   */
  nearestHidden(level, x, z) {
    let best = Infinity, bx = 0, bz = 0;
    for (const s of this.secrets.values()) {
      if (s.done || s.level !== level) continue;
      const w = this.grid.tileToWorld(level, s.tx, s.ty);
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < best) { best = d; bx = w.x - x; bz = w.z - z; }
    }
    return { distance: best, yaw: best === Infinity ? null : Math.atan2(bx, bz) };
  }

  /** Reveal any secret within `radius` of the player. @returns {number} newly found */
  checkReveals(level, x, z, radius) {
    let found = 0;
    for (const [key, s] of this.secrets) {
      if (s.done || s.level !== level) continue;
      const w = this.grid.tileToWorld(level, s.tx, s.ty);
      if (Math.hypot(w.x - x, w.z - z) > radius) continue;
      s.done = true;
      this.revealing.push(s);
      this.revealed.add(key);
      found++;
    }
    return found;
  }

  update(dt) {
    for (let i = this.revealing.length - 1; i >= 0; i--) {
      const s = this.revealing[i];
      s.t += dt / 0.75;
      const mat = s.mesh.material;
      if (!mat.transparent) {
        mat.transparent = true;
        mat.depthWrite = false;
        mat.emissive = new THREE.Color(0x7fd4ff);
      }
      // flash cool, then crumble away
      mat.emissiveIntensity = Math.sin(Math.min(1, s.t) * Math.PI) * 1.6;
      mat.opacity = 1 - Math.min(1, s.t);
      const k = Math.min(1, s.t);
      s.mesh.position.y = -(k * k) * 1.2;   // sinks as it crumbles
      if (s.t >= 1) {
        s.mesh.visible = false;
        this.revealing.splice(i, 1);
      }
    }
  }
}

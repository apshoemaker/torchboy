import * as THREE from 'three';

/**
 * Pickups and markers, cloned from props.glb onto the tiles the grid names.
 *
 * Each pickup carries its own small light: in a cave lit only by the torch, an
 * unlit pickup two tiles away is invisible, and a cache the player can never
 * see is indistinguishable from one that is not there.
 */
const SPEC = {
  // `wonder` is the radius at which the choir starts to hear this thing. Embers
  // are common, so theirs is short - a chorus that sang for all 18 of them
  // would be wallpaper. Treasure and the way out are rare, and carry further.
  F: { prop: 'Prop_Fuel', kind: 'ember', y: 0.05, bob: 0.13, spin: 0.9, glow: 0xff8a2a, glowI: 2.2, dist: 5.5, wonder: 8 },
  T: { prop: 'Prop_Treasure', kind: 'treasure', y: 0.02, bob: 0.05, spin: 0.25, glow: 0xffc65a, glowI: 2.6, dist: 6.5, wonder: 14 },
  X: { prop: 'Prop_Exit', kind: 'exit', y: 0.0, bob: 0, spin: 0, glow: 0x9fd0ff, glowI: 3.0, dist: 9, wonder: 17 },
  // he CLIMBS: '>' is the way onward and gets rising steps; '<' is the mouth
  // of the shaft he came up out of
  '>': { prop: 'Prop_StairsUp', kind: 'up', y: 0.0, bob: 0, spin: 0 },
  '<': { prop: 'Prop_StairsDown', kind: 'down', y: 0.0, bob: 0, spin: 0 },
};

export class Props {
  constructor(propsGltf, grid, cavern) {
    this.grid = grid;
    this.group = new THREE.Group();
    this.items = [];
    // Look prototypes up BY NAME, not by isMesh. A Blender object with more
    // than one material exports as several glTF primitives, which GLTFLoader
    // rebuilds as a Group - so the flask, the chest and the archway are all
    // Groups, and an isMesh filter silently drops every one of them.
    const src = {};
    for (const name of new Set(Object.values(SPEC).map((v) => v.prop))) {
      const node = propsGltf.scene.getObjectByName(name);
      if (node) src[name] = node;
    }

    for (const lv of grid.levels) {
      for (const [ch, spec] of Object.entries(SPEC)) {
        for (const { tx, ty } of grid.find(lv.index, ch)) {
          const proto = src[spec.prop];
          if (!proto) continue;
          const mesh = proto.clone();
          mesh.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = spec.kind !== 'exit';
            o.receiveShadow = true;
          });
          const w = grid.tileToWorld(lv.index, tx, ty);
          const base = grid.floorHeight(lv.index, w.x, w.z) + spec.y;
          mesh.position.set(w.x, base, w.z);
          mesh.rotation.y = (tx * 37 + ty * 17) % 360 * Math.PI / 180;

          // The way onward stays out of the world until the level is finished.
          // Not just untriggerable - unseen: half the point is that he cannot
          // plan an escape past the passages he has not found yet.
          const gated = spec.kind === 'up' || spec.kind === 'exit';
          const item = { mesh, spec, level: lv.index, tx, ty, base, taken: false,
                         gated, sealed: gated, reveal: 0, phase: (tx + ty) * 0.7 };
          if (spec.glow) {
            item.light = new THREE.PointLight(spec.glow, spec.glowI, spec.dist, 1.8);
            item.light.position.set(w.x, base + 0.35, w.z);
            this.group.add(item.light);
          }
          this.group.add(mesh);
          this.items.push(item);
        }
      }
    }
  }

  /**
   * Boot-time self-check. Reversing the game from a descent to a climb turned
   * an `i + 1` in setActiveLevel from "the level below" into "the level above",
   * and every pickup on it hung 9 units over his head - visible only because
   * they are emissive. Cheap to verify, and it would have caught that instantly.
   */
  selfCheck(grid) {
    const bad = [];
    for (const it of this.items) {
      const floor = grid.floorHeight(it.level, it.mesh.position.x, it.mesh.position.z);
      const slack = (it.spec.bob || 0) + (it.spec.y || 0) + 0.05;
      const above = it.mesh.position.y - floor;
      if (above < -0.05 || above > slack) bad.push(`${it.spec.kind}@L${it.level} ${above.toFixed(2)}u`);
    }
    // probe every level for props leaking in from a neighbouring one. The
    // sealed way onward is legitimately invisible, so lift the seals for the
    // probe and put them back - otherwise this only ever proves it is hidden.
    const sealed = this.items.filter((it) => it.sealed);
    for (const it of sealed) it.sealed = false;
    for (let lvl = 0; lvl < grid.levels.length; lvl++) {
      this.setActiveLevel(lvl);
      for (const it of this.items)
        if (it.mesh.visible && it.level !== lvl)
          bad.push(`${it.spec.kind} from L${it.level} visible on L${lvl}`);
    }
    for (const it of sealed) it.sealed = true;
    if (bad.length) console.warn('[props] off the ground or on the wrong level:', bad);
    return bad;
  }

  /**
   * Open the way onward on a level he has finished. Returns the item so the
   * caller can point the player at it; null if there was nothing sealed.
   */
  unseal(level) {
    const it = this.items.find((o) => o.level === level && o.sealed);
    if (!it) return null;
    it.sealed = false;
    it.reveal = 0.0001;                 // >0 drives the grow-in in update()
    it.mesh.visible = true;
    it.mesh.scale.setScalar(0.01);
    if (it.light) { it.light.visible = true; it.light.intensity = 0; }
    return it;
  }

  /** Is the way onward on this level still sealed? */
  isSealed(level) {
    return this.items.some((o) => o.level === level && o.sealed);
  }

  setActiveLevel(i) {
    for (const it of this.items) {
      // ONLY the current level. This used to also show `i + 1`, which was the
      // level BELOW back when the game was a descent - after it was reversed
      // into a climb, i+1 became the level ABOVE and every ember and chest on
      // it hung 9 units over his head, still glowing because they are emissive.
      const on = !it.taken && it.level === i && !it.sealed;
      it.mesh.visible = on;
      if (it.light) it.light.visible = on;
    }
  }

  update(t, dt) {
    for (const it of this.items) {
      if (it.taken || !it.mesh.visible) continue;
      const s = it.spec;
      // a way onward that has just been earned grows out of the floor rather
      // than popping into existence a few tiles from his feet
      if (it.reveal > 0 && it.reveal < 1) {
        it.reveal = Math.min(1, it.reveal + dt / 1.1);
        const e = 1 - Math.pow(1 - it.reveal, 3);      // ease out
        it.mesh.scale.setScalar(0.01 + 0.99 * e);
        it.mesh.position.y = it.base - (1 - e) * 0.8;
        if (it.reveal >= 1) it.mesh.position.y = it.base;
      }
      if (s.bob) it.mesh.position.y = it.base + Math.sin(t * 1.9 + it.phase) * s.bob;
      if (s.spin) it.mesh.rotation.y += s.spin * dt;
      if (it.light) {
        it.light.position.y = it.mesh.position.y + 0.35;
        it.light.intensity = s.glowI * (0.85 + Math.sin(t * 3.1 + it.phase) * 0.15);
      }
    }
  }

  /**
   * Raw closeness to the nearest uncollected thing, 0..1 linear.
   * The shaping curve lives in Ambience so there is exactly one of it - an
   * earlier version curved here AND there, and the double-squaring meant the
   * choir was still at 9% strength three quarters of the way in.
   */
  wonder(level, x, z) {
    let best = 0;
    for (const it of this.items) {
      // a sealed way out is not in the world yet, so the choir must not sing
      // for it - otherwise the shimmer walks him to a door he cannot open
      if (it.taken || it.sealed || it.level !== level || !it.spec.wonder) continue;
      const d = Math.hypot(it.mesh.position.x - x, it.mesh.position.z - z);
      if (d < it.spec.wonder) best = Math.max(best, 1 - d / it.spec.wonder);
    }
    return best;
  }

  /** @returns the nearest untaken item of interest within `r`, or null. */
  nearest(level, x, z, r) {
    let best = null, bd = r * r;
    for (const it of this.items) {
      if (it.taken || it.sealed || it.level !== level) continue;
      const d = (it.mesh.position.x - x) ** 2 + (it.mesh.position.z - z) ** 2;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  take(item) {
    item.taken = true;
    item.mesh.visible = false;
    if (item.light) item.light.visible = false;
  }
}

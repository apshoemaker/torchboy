import * as THREE from 'three';
import { Expression } from './Expression.js';

/**
 * The boy. Movement + collision against the grid, and an animation state
 * machine over the three clips exported from Blender.
 *
 * The model faces -Y in Blender, which the glTF Y-up conversion turns into
 * +Z, so atan2(dx, dz) aims him correctly with no correction offset.
 */
const SPEED = 3.2;
const RADIUS = 0.42;

/**
 * Ground the walk clip covers in one cycle, derived from the rig:
 * 4 * legLength * sin(swing), with legLength 0.28 and swing 1.02rad.
 *
 * Playback is scaled by actual ground speed divided by this, so a planted foot
 * stays planted. Without it the clip ran at a fixed rate while he moved 5.9x
 * faster than its stride implied, and he skated everywhere.
 *
 * He has very short legs and covers ground quickly, so a fully locked foot
 * means a fast cadence - that is a real consequence of the proportions, not a
 * bug. FOOT_LOCK below 1 trades a calmer cadence for some sliding back.
 */
const STRIDE_PER_CYCLE = 0.954;
const FOOT_LOCK = 1.0;
const CADENCE_CAP = 3.6; // ceiling on playback rate, so it never blurs

export class Player {
  constructor(gltf, grid) {
    this.grid = grid;
    this.root = gltf.scene;
    this.root.traverse((o) => {
      // He neither casts NOR receives the torch's shadow, both for the same
      // reason: the light lives on his own hand, ~1 unit away.
      //   cast    - his shadow would be projected enormous and blot out the room
      //   receive - his head straddles several faces of the point light's shadow
      //             cube map at that range, which painted a hard pale wedge
      //             across his face
      // A contact shadow grounds him instead.
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
      if (o.isSkinnedMesh) o.frustumCulled = false; // skinned bounds go stale
    });

    this.blob = Player.contactShadow();

    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      this.actions[clip.name] = a;
    }
    this.actions.Gather?.setLoop(THREE.LoopOnce, 1);
    if (this.actions.Gather) this.actions.Gather.clampWhenFinished = true;

    this.state = null;
    this.play('Idle', 0);
    this.mixer.addEventListener('finished', () => {
      this.busy = false;
    });

    this.flame = this.root.getObjectByName('flame');
    this.expr = new Expression(this.root);
    this.level = 0;
    this.busy = false;
    this.pos = new THREE.Vector3();
    this.facing = 0;
    this.moving = false;
    this.groundSpeed = 0;
  }

  static contactShadow() {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(c);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.15),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        // MultiplyBlending in three requires premultiplied alpha, or it warns
        // once per frame for the life of the session
        blending: THREE.MultiplyBlending,
        premultipliedAlpha: true,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;
    return mesh;
  }

  play(name, fade = 0.22) {
    const next = this.actions[name];
    if (!next || this.state === name) return;
    const prev = this.actions[this.state];
    next.reset().setEffectiveWeight(1).play();
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
    this.state = name;
  }

  playOnce(name) {
    const a = this.actions[name];
    if (!a) return;
    this.busy = true;
    a.reset().setEffectiveWeight(1).play();
    const prev = this.actions[this.state];
    if (prev && prev !== a) prev.crossFadeTo(a, 0.15, false);
    this.state = name;
  }

  placeAt(level, tx, ty) {
    this.level = level;
    const w = this.grid.tileToWorld(level, tx, ty);
    this.pos.set(w.x, this.grid.floorHeight(level, w.x, w.z), w.z);
    this.root.position.copy(this.pos);
  }

  /**
   * @param mood {proximity, lookYaw} - live game state the face reacts to.
   *   lookYaw is the yaw offset toward whatever he can sense, in radians.
   */
  update(dt, axis, basis, revealed, mood = {}) {
    let dx = 0,
      dz = 0;
    if (!this.busy) {
      dx = basis.right.x * axis.x + basis.fwd.x * axis.y;
      dz = basis.right.z * axis.x + basis.fwd.z * axis.y;
    }
    const len = Math.hypot(dx, dz);
    this.moving = len > 0.01;

    if (this.moving) {
      dx = (dx / len) * SPEED * dt;
      dz = (dz / len) * SPEED * dt;
      const beforeX = this.pos.x,
        beforeZ = this.pos.z;
      const r = this.grid.moveCircle(
        this.level,
        this.pos.x,
        this.pos.z,
        dx,
        dz,
        RADIUS,
        revealed,
      );
      this.pos.x = r.x;
      this.pos.z = r.z;
      // measure what he ACTUALLY covered, not what he asked for - scraping
      // along a wall should slow his legs too
      const moved = Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ);
      this.groundSpeed = moved / Math.max(dt, 1e-4);

      const want = Math.atan2(dx, dz);
      let d = want - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 14);
    }

    this.pos.y = this.grid.floorHeight(this.level, this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this.blob.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);

    if (!this.moving)
      this.groundSpeed += (0 - this.groundSpeed) * Math.min(1, dt * 12);

    if (!this.busy) this.play(this.moving ? 'Walk' : 'Idle');

    // match the cycle to the ground he is covering
    const walk = this.actions.Walk;
    if (walk) {
      const cycle = walk.getClip().duration;
      const locked =
        ((this.groundSpeed * cycle) / STRIDE_PER_CYCLE) * FOOT_LOCK;
      walk.timeScale = THREE.MathUtils.clamp(locked, 0.55, CADENCE_CAP);
    }
    this.mixer.update(dt);

    // MUST come after mixer.update: the expression layer composes onto the
    // pose the mixer just wrote. Run it before and the mixer overwrites it.
    this.expr.update(dt, {
      facing: this.facing,
      proximity: mood.proximity || 0,
      lookYaw: mood.lookYaw ?? null,
      moving: this.moving,
    });
  }

  /** Play the "found it" beat on the face. */
  react(strength) {
    this.expr.react(strength);
  }
}

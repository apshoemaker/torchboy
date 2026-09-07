import * as THREE from 'three';

/**
 * A procedural animation layer applied ON TOP of the baked clips.
 *
 * Everything here depends on live game state - which way he just turned, how
 * close a hidden passage is, whether he just found one - so none of it can be
 * a baked clip. It runs AFTER mixer.update() and COMPOSES onto the pose the
 * mixer just wrote, rather than replacing it, so the walk cycle still shows
 * through the head turn.
 *
 * Bone axis convention (every bone is authored pointing +Z in Blender, so):
 *   local Y = along the bone (up)  -> yaw, and vertical translation
 *   local X = his right           -> pitch / nod
 *   local Z = forward             -> roll / brow tilt
 */
const _q = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);

/** Post-multiply a local-axis rotation onto whatever the mixer wrote. */
function addRot(bone, axis, angle) {
  if (!bone || Math.abs(angle) < 1e-5) return;
  bone.quaternion.multiply(_q.setFromAxisAngle(axis, angle));
}

/** Critically-damped-ish spring, frame-rate independent. */
function spring(state, target, dt, stiffness, damping) {
  const a = (target - state.v) * stiffness - state.d * damping;
  state.d += a * dt;
  state.v += state.d * dt;
  return state.v;
}

export class Expression {
  constructor(root) {
    this.b = {};
    for (const n of ['head', 'spine', 'browL', 'browR', 'eyeL', 'eyeR', 'torch', 'armR'])
      this.b[n] = root.getObjectByName(n);

    this.t = 0;
    this.prevFacing = 0;

    // the big head has inertia: it lags a turn, then overshoots and settles
    this.headYaw = { v: 0, d: 0 };
    this.headPitch = { v: 0, d: 0 };
    this.headRoll = { v: 0, d: 0 };

    this.blinkT = 1.2 + Math.random() * 2.5;
    this.blink = 0;            // 0 open .. 1 shut
    this.blinkQueue = 0;

    this.brow = 0;             // -1 furrowed .. +1 raised
    this.browTarget = 0;
    this.eyeWide = 0;
    this.reaction = 0;         // decays after a discovery
    this.lookAt = 0;           // -1..1 yaw toward something interesting
  }

  /** Fire the "I found it!" beat. */
  react(strength = 1) {
    this.reaction = strength;
    this.blinkQueue = 0;              // don't blink through the surprise
    this.blinkT = Math.max(this.blinkT, 0.45);
  }

  /**
   * @param facing       current body yaw (radians)
   * @param proximity    0..1 how strongly the torch senses a hidden way
   * @param lookYaw      yaw offset toward the sensed thing, radians (or null)
   * @param moving       is he walking
   */
  update(dt, { facing, proximity = 0, lookYaw = null, moving = false }) {
    this.t += dt;
    const b = this.b;

    // ---- head follows the turn, late and with overshoot -------------------
    let dYaw = facing - this.prevFacing;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    this.prevFacing = facing;
    const turnRate = dYaw / Math.max(dt, 1e-4);

    // he leads into the turn with his head, then it swings back past centre
    let yawTarget = THREE.MathUtils.clamp(turnRate * 0.155, -0.50, 0.50);
    if (lookYaw !== null) yawTarget += THREE.MathUtils.clamp(lookYaw, -0.7, 0.7) * 0.85;
    spring(this.headYaw, yawTarget, dt, 150, 16);   // under-damped: it overshoots and settles

    // and it pitches back a little when he sets off, like the weight caught up
    const pitchTarget = (moving ? -0.06 : 0) - this.reaction * 0.18;
    spring(this.headPitch, pitchTarget, dt, 120, 14);

    // a curious tilt when something is close
    spring(this.headRoll, proximity * 0.11 + this.reaction * 0.14, dt, 90, 13);

    addRot(b.head, _axisY, this.headYaw.v);
    addRot(b.head, _axisX, this.headPitch.v);
    addRot(b.head, _axisZ, this.headRoll.v);
    // the body follows the head a little, so a turn reads through the torso
    addRot(b.spine, _axisY, this.headYaw.v * 0.25);

    // ---- blinking ---------------------------------------------------------
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkQueue = Math.random() < 0.22 ? 2 : 1;   // occasional double
      // blink more often when alert, less when plodding
      this.blinkT = 1.8 + Math.random() * 4.0 - proximity * 1.0;
    }
    if (this.blinkQueue > 0 && this.blink <= 0) {
      this.blink = 1e-3;
      this.blinkPhase = 0;
    }
    if (this.blink > 0) {
      this.blinkPhase = (this.blinkPhase || 0) + dt / 0.13;   // ~130ms per blink
      this.blink = Math.sin(Math.min(1, this.blinkPhase) * Math.PI);
      if (this.blinkPhase >= 1) {
        this.blink = 0;
        this.blinkPhase = 0;
        this.blinkQueue--;
      }
    }

    // ---- eyes: shut by the blink, widened by surprise ---------------------
    this.eyeWide += (this.reaction * 0.9 - this.eyeWide) * Math.min(1, dt * 12);
    const lid = 1 - this.blink * 0.92;
    const wide = 1 + this.eyeWide * 0.55;
    for (const e of [b.eyeL, b.eyeR]) {
      if (!e) continue;
      e.scale.set(wide, lid * wide, wide);     // local Y is vertical
    }

    // ---- brows ------------------------------------------------------------
    // calm -> level; sensing -> rising and pulling together; found -> shot up
    this.browTarget = proximity * 0.75 + this.reaction * 1.4 - (moving ? 0.25 : 0);
    this.brow += (this.browTarget - this.brow) * Math.min(1, dt * 9);
    const rise = this.brow * 0.020;
    const pinch = (1 - Math.min(1, Math.abs(this.brow))) * 0.10 + proximity * 0.05;
    // a slow asymmetric drift so a resting face is never perfectly still
    const drift = Math.sin(this.t * 0.7) * 0.02;
    if (b.browL) {
      b.browL.position.y += rise + drift;
      addRot(b.browL, _axisZ, pinch - this.reaction * 0.30);
    }
    if (b.browR) {
      b.browR.position.y += rise - drift;
      addRot(b.browR, _axisZ, -pinch + this.reaction * 0.30);
    }

    // ---- the torch jumps in his hand on a discovery ------------------------
    if (this.reaction > 0.01) addRot(b.torch, _axisX, -this.reaction * 0.35);

    this.reaction *= Math.exp(-dt * 2.4);
  }
}

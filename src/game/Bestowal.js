import * as THREE from 'three';

/**
 * Something ancient comes up out of the floor and enters him.
 *
 * Fired when he opens a sealed way or descends. Four parts, all additive so
 * they read as light rather than as objects: a ring that opens on the stone, a
 * core that gathers and rises, a halo around it, and a point light that travels
 * with the whole thing so the cave lights up as it climbs.
 *
 * The target tracks his chest rather than being fixed at spawn, so walking
 * during the rise looks like the light chasing him down rather than a bug.
 */

// Cold, to rhyme with the way the flame turns blue-white near a hidden way.
const COLD = new THREE.Color(0.62, 0.88, 1.0);
const HOT = new THREE.Color(1.0, 1.0, 1.0);

const GATHER = 0.38; // light pools on the floor
const RISE = 1.18; // ...and climbs
const ENTER = 1.32; // ...and goes in
const DONE = 1.95;

function glowTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(190,235,255,0.55)');
  g.addColorStop(1.0, 'rgba(120,200,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Bestowal {
  constructor(scene) {
    this.t = Infinity;
    this.from = new THREE.Vector3();

    const add = {
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    };

    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.17, 2),
      new THREE.MeshBasicMaterial({ ...add, color: COLD.clone() }),
    );

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        ...add,
        map: glowTexture(),
        color: COLD.clone(),
      }),
    );

    // the ring lies flat on the stone and opens outward as the light gathers
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.42, 40),
      new THREE.MeshBasicMaterial({
        ...add,
        color: COLD.clone(),
        side: THREE.DoubleSide,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;

    // Kept well under the torch (~30 at full). At 9x brightness this peaked at
    // 34 and flooded the whole cavern white, which buried the orb it was
    // supposed to be lighting.
    this.light = new THREE.PointLight(0x9fd8ff, 0, 7, 1.6);

    this.group = new THREE.Group();
    this.group.add(this.core, this.halo, this.ring, this.light);
    this.group.visible = false;
    scene.add(this.group);
  }

  get active() {
    return this.t < DONE;
  }

  /**
   * @param at     floor position under him
   * @param camDir normalised XZ direction from him toward the camera
   *
   * The spawn is pushed toward the camera. Rising from directly beneath him put
   * the orb behind his own body for most of the climb, so the effect was mostly
   * invisible; offset, it arcs in from the front and reads the whole way up.
   */
  fire(at, camDir) {
    this.t = 0;
    const push = 0.62;
    this.from.set(
      at.x + (camDir ? camDir.x * push : 0),
      at.y,
      at.z + (camDir ? camDir.z * push : 0),
    );
    this.group.visible = true;
  }

  /** @returns true on the frame the light actually enters him */
  update(dt, chest) {
    if (!this.active) {
      this.group.visible = false;
      return false;
    }
    const prev = this.t;
    this.t += dt;
    const t = this.t;
    let entered = false;

    // ---- ring: snaps open on the stone, then fades as the light lifts away
    const ringP = Math.min(1, t / (GATHER * 1.6));
    const ringE = 1 - Math.pow(1 - ringP, 3);
    this.ring.position.set(this.from.x, this.from.y + 0.03, this.from.z);
    this.ring.scale.setScalar(0.35 + ringE * 1.5);
    this.ring.material.opacity = Math.max(0, 0.85 * (1 - ringP) ** 1.3);

    // ---- core: gathers at the floor, then climbs, accelerating
    let y, scale, bright;
    if (t < GATHER) {
      const p = t / GATHER;
      y = this.from.y + 0.06 + p * 0.1;
      scale = p * p * 1.15; // swells into being
      bright = p;
    } else if (t < RISE) {
      const p = (t - GATHER) / (RISE - GATHER);
      const e = p * p * (3 - 2 * p) * 0.58 + p * p * p * 0.42; // eases, then rushes
      y = THREE.MathUtils.lerp(this.from.y + 0.16, chest.y, e);
      scale = 1.15 - p * 0.25;
      bright = 1 + p * 0.7;
    } else if (t < ENTER) {
      const p = (t - RISE) / (ENTER - RISE);
      y = chest.y;
      scale = Math.max(0, 0.9 * (1 - p) ** 0.6); // collapses into him
      bright = 1.7 + p * 2.6; // and flares as it goes
      if (prev < RISE) entered = true;
    } else {
      const p = (t - ENTER) / (DONE - ENTER);
      y = chest.y;
      scale = 0;
      bright = Math.max(0, 4.3 * (1 - p) ** 2); // afterglow inside him
    }

    // it drifts toward him laterally as it climbs, so it lands on his chest
    // lateral drift lags the climb (cubed), so it rises first and only swings
    // in toward him at the end - an arc rather than a straight line
    const climb = THREE.MathUtils.clamp((t - GATHER) / (RISE - GATHER), 0, 1);
    const lat = climb * climb * climb;
    const x = THREE.MathUtils.lerp(this.from.x, chest.x, lat);
    const z = THREE.MathUtils.lerp(this.from.z, chest.z, lat);

    this.core.position.set(x, y, z);
    this.core.scale.setScalar(Math.max(0.001, scale));
    this.core.material.opacity = Math.min(1, bright * 0.9);
    this.core.material.color
      .copy(COLD)
      .lerp(HOT, Math.min(1, (bright - 1) / 2));

    this.halo.position.copy(this.core.position);
    // The halo was scaling past 3 world units - wider than he is - so the orb
    // read as a white wash instead of a light with a shape. Keep it close.
    this.halo.scale.setScalar(Math.max(0.001, scale * 1.25 + bright * 0.14));
    this.halo.material.opacity = Math.min(0.85, bright * 0.34);

    this.light.position.set(x, y + 0.05, z);
    this.light.intensity = bright * 2.4;

    return entered;
  }
}

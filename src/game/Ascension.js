import * as THREE from 'three';

/**
 * The ending: he walks into the daylight and comes apart in it.
 *
 * Five phases. Control is taken from the player at the first, because this is
 * the one moment the game should be watched rather than played.
 *
 *   approach  he walks the last few steps himself
 *   brighten  the light in the arch swells until it is the only thing left
 *   dissolve  he comes apart upward - motes leaving him, his body thinning out
 *   white     the screen goes to daylight
 *   done      the last of his story
 *
 * The motes rise rather than scatter. Falling would read as destruction; rising
 * reads as being taken up, which is the note the story ends on.
 */
const APPROACH = 2.4;
const BRIGHTEN = APPROACH + 1.3;
const DISSOLVE = BRIGHTEN + 2.8;
const WHITE = DISSOLVE + 1.6;

const MOTES = 420;

function moteTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const gr = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  gr.addColorStop(0, 'rgba(255,252,240,1)');
  gr.addColorStop(0.4, 'rgba(255,236,200,0.5)');
  gr.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Ascension {
  constructor(scene) {
    this.scene = scene;
    this.t = -1;
    this.done = false;
    this.target = new THREE.Vector3();
    this.from = new THREE.Vector3();

    const pos = new Float32Array(MOTES * 3);
    this.seed = [];
    for (let i = 0; i < MOTES; i++) {
      this.seed.push({
        // spread over his silhouette, denser low where his body is solid
        ox: (Math.random() - 0.5) * 0.52,
        oy: Math.random() * 1.35,
        oz: (Math.random() - 0.5) * 0.52,
        rise: 0.7 + Math.random() * 2.3,
        drift: (Math.random() - 0.5) * 0.5,
        delay: Math.random() * 0.55,
        swirl: Math.random() * Math.PI * 2,
      });
    }
    this.points = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({
        size: 0.10, map: moteTexture(), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
        color: 0xfff0d0, sizeAttenuation: true, opacity: 0,
      }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);

    this.light = new THREE.PointLight(0xfff1d6, 0, 30, 1.2);
    this.light.visible = false;
    scene.add(this.light);
  }

  get active() { return this.t >= 0 && !this.done; }
  get phase() {
    if (this.t < APPROACH) return 'approach';
    if (this.t < BRIGHTEN) return 'brighten';
    if (this.t < DISSOLVE) return 'dissolve';
    if (this.t < WHITE) return 'white';
    return 'done';
  }

  /** @param exit world position of the archway */
  start(player, exit) {
    this.t = 0;
    this.done = false;
    this.from.copy(player.pos);
    // stop a little short, so he is IN the arch rather than through it
    this.target.set(exit.x, exit.y, exit.z);
    this.light.position.set(exit.x, exit.y + 1.3, exit.z);
    this.light.visible = true;
    this.points.visible = true;
    this._faded = false;
  }

  /** @returns {{ whiteout:number, finished:boolean }} */
  update(dt, player) {
    if (!this.active) return { whiteout: 0, finished: this.done };
    this.t += dt;
    const t = this.t;

    // ---- he walks the last steps himself
    if (t < APPROACH) {
      const p = t / APPROACH;
      const e = p * p * (3 - 2 * p);
      player.pos.lerpVectors(this.from, this.target, e);
      player.root.position.copy(player.pos);
      player.moving = true;
      player.play('Walk');
      const dx = this.target.x - this.from.x, dz = this.target.z - this.from.z;
      if (dx || dz) player.root.rotation.y = Math.atan2(dx, dz);
    } else {
      player.moving = false;
      player.play('Idle');
    }

    // ---- the arch light swells and then holds
    const bright = t < APPROACH ? (t / APPROACH) * 0.35
      : t < BRIGHTEN ? 0.35 + ((t - APPROACH) / (BRIGHTEN - APPROACH)) * 0.65
      : 1;
    // This is the climax - it should overwhelm. Everywhere else in the game the
    // light is hoarded; here it stops being scarce.
    this.light.intensity = bright * 150;
    this.light.distance = 26 + bright * 40;

    // ---- he comes apart, upward
    let dissolve = 0;
    if (t >= BRIGHTEN) dissolve = Math.min(1, (t - BRIGHTEN) / (DISSOLVE - BRIGHTEN));
    if (dissolve > 0) {
      const arr = this.points.geometry.attributes.position.array;
      for (let i = 0; i < MOTES; i++) {
        const s = this.seed[i];
        const local = Math.max(0, Math.min(1, (dissolve - s.delay) / (1 - s.delay)));
        const lift = local * local * s.rise * 2.6;
        const spin = s.swirl + local * 3.2;
        arr[i*3]     = player.pos.x + s.ox + Math.cos(spin) * s.drift * local;
        arr[i*3 + 1] = player.pos.y + s.oy + lift;
        arr[i*3 + 2] = player.pos.z + s.oz + Math.sin(spin) * s.drift * local;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.material.opacity = Math.sin(Math.min(1, dissolve * 1.15) * Math.PI) * 0.95;

      // his body thins from the feet up as the motes leave
      this._fadeBody(player, 1 - dissolve);
    }

    // the screen starts going while he is still coming apart, so the two read
    // as one event rather than a dissolve followed by a fade
    const wStart = BRIGHTEN + (DISSOLVE - BRIGHTEN) * 0.55;
    const whiteout = t < wStart ? 0
      : Math.min(1, (t - wStart) / (WHITE - wStart));

    if (t >= WHITE && !this.done) {
      this.done = true;
      player.root.visible = false;
      this.points.material.opacity = 0;
    }
    return { whiteout, finished: this.done };
  }

  _fadeBody(player, amount) {
    player.root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m.__ascendPrepped) { m.transparent = true; m.depthWrite = false; m.__ascendPrepped = true; }
        m.opacity = Math.max(0, amount);
      }
    });
    if (player.blob) player.blob.material.opacity = Math.max(0, amount * 0.5);
  }
}

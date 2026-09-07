import * as THREE from 'three';

/**
 * The torch: a permanent light, and the player's instrument for finding
 * hidden passages.
 *
 * It does not burn out. Its job is DISCOVERY: as an undiscovered secret comes
 * within range the flame stirs, flares and cools toward blue-white, so hunting
 * a passage is a hot-and-cold game you play by watching your own light rather
 * than by walking into every wall in the cave.
 *
 * Embers collected in the cave permanently widen that sense.
 */
const BASE_SENSE = 2.6;
const EMBER_SENSE = 0.62;      // scaled by sqrt(embers), see revealRadius
const SENSE_CAP = 12;          // the hunt should never become trivial

const _flamePos = new THREE.Vector3();
const _bodyPos = new THREE.Vector3();
const _out = new THREE.Vector3();
// Warm amber at rest, cold blue-white when a passage is near. These are lerped
// in RGB rather than swept in HUE: a hue sweep from amber to cyan travels
// through green, and a cave lit by green torchlight looks sickly, not eerie.
const WARM = new THREE.Color(1.00, 0.60, 0.26);
const COLD = new THREE.Color(0.70, 0.88, 1.00);

export class Torch {
  constructor(scene) {
    this.embers = 0;
    this.proximity = 0;          // 0..1, how near the closest hidden passage is
    this._prox = 0;              // damped, for a smooth light response

    // distance = 0 on purpose: a non-zero cutoff makes three.js window the
    // falloff to zero at that radius, which draws a hard-edged disc of light on
    // the floor.
    //
    // decay is deliberately BELOW the physical 2.0. The light rides on the
    // player's own hand, ~1 unit from his body, but has to light a room 6-10
    // units across. True inverse-square over that range is a 36:1 ratio: tune
    // it for the room and his torch-side clips to flat white, with the
    // clipping boundary reading as a hard edge across his face.
    this.light = new THREE.PointLight(0xffb066, 0, 0, 1.25);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.bias = -0.004;
    this.light.shadow.normalBias = 0.03;   // curbs acne on the cave's big flat facets
    this.light.shadow.camera.near = 0.15;
    this.light.shadow.camera.far = 26;

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: Torch.glowTexture(), color: 0xffb266, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
    }));
    this.halo.scale.setScalar(1.5);

    this.anchor = null;
    this.body = null;
    // How far to push the LIGHT out past the flame, away from his body. The
    // visible flame stays on the torch tip; only the light source moves. His
    // body would otherwise sit closer to the lamp than the floor it has to
    // illuminate, so no intensity can light the room without frying him.
    this.pushOut = 0.7;
    this._t = 0;
    this._flick = 1;
    scene.add(this.light, this.halo);
  }

  attachTo(node, body) { this.anchor = node; this.body = body; }

  /**
   * How close a passage must be before it opens. Embers widen it, but on a
   * SQRT curve: there are 18 embers in the cave and a linear bonus would grow
   * this past 12 units, wide enough to pop every secret on the level without
   * the player ever hunting for one.
   */
  get revealRadius() { return BASE_SENSE + EMBER_SENSE * Math.sqrt(this.embers); }

  /** How far out the flame can *feel* a passage - the hot/cold range. */
  get senseRadius() { return Math.min(this.revealRadius * 3.2, SENSE_CAP); }

  addEmber() { this.embers++; }

  /** @param nearest distance to the closest undiscovered secret, or Infinity */
  sense(nearest) {
    const r = this.revealRadius, s = this.senseRadius;
    this.proximity = nearest >= s ? 0
      : nearest <= r ? 1
      : 1 - (nearest - r) / (s - r);
  }

  update(dt) {
    this._t += dt;
    this._prox += (this.proximity - this._prox) * Math.min(1, dt * 5);
    const p = this._prox;

    // a flame gutters; two detuned sines plus noise, agitated by proximity
    const rate = 1 + p * 1.8;
    const n = Math.sin(this._t * 11.3 * rate) * 0.5
      + Math.sin(this._t * 27.7 * rate) * 0.3
      + (Math.random() - 0.5) * 0.4;
    const amp = 0.12 + p * 0.30;
    this._flick += ((1 + n * amp) - this._flick) * Math.min(1, dt * 16);

    const glow = 1 + this.embers * 0.10;
    // inverse-square needs a much larger number than a windowed light did
    this.light.intensity = (33 + p * 25) * glow * this._flick;
    this.light.color.lerpColors(WARM, COLD, p);
    this.halo.material.color.copy(this.light.color);

    if (this.anchor) {
      this.anchor.getWorldPosition(_flamePos);
      this.halo.position.copy(_flamePos);           // the glow stays on the tip
      if (this.body) {
        this.body.getWorldPosition(_bodyPos);
        _bodyPos.y += 0.9;                          // aim from his chest, not his feet
        _out.subVectors(_flamePos, _bodyPos);
        if (_out.lengthSq() > 1e-6) _out.normalize();
        else _out.set(0, 1, 0);
        this.light.position.copy(_flamePos).addScaledVector(_out, this.pushOut);
      } else {
        this.light.position.copy(_flamePos);
      }
    }
    // The halo is kept small deliberately: the flame sits ~0.9 above the floor,
    // and a sprite wide enough to reach the ground gets sliced by it into a
    // hard straight edge. The light, not the sprite, carries the glow.
    this.halo.material.opacity = (0.55 + p * 0.22) * this._flick;
    this.halo.scale.setScalar(Math.min(1.15, (0.82 + p * 0.28) * this._flick));
  }

  static glowTexture() {
    const s = 256;                    // more room for a smooth ramp
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    // a long, gentle ramp - a tight bright core reads as an opaque blob and
    // hides the cave behind it instead of glowing over it
    g.addColorStop(0.00, 'rgba(255,248,232,0.85)');
    g.addColorStop(0.12, 'rgba(255,226,178,0.55)');
    g.addColorStop(0.30, 'rgba(255,186,110,0.26)');
    g.addColorStop(0.55, 'rgba(255,150,70,0.09)');
    g.addColorStop(0.78, 'rgba(255,130,55,0.025)');
    g.addColorStop(1.00, 'rgba(255,120,45,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
}

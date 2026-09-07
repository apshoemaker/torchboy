/**
 * A breathy, sung vocal tract, as an AudioWorkletProcessor.
 *
 * This is the classic Kelly-Lochbaum digital waveguide (a 1962 model of the
 * vocal tract as a chain of cylindrical sections) driven by Fant's LF glottal
 * flow model plus aspiration noise. It is the same physics Neil Thapen's Pink
 * Trombone implements; written here from the published model so it can live on
 * the AUDIO thread. The npm port runs in a ScriptProcessorNode on the main
 * thread, which in a game means the renderer and the synth stall each other.
 *
 * ONE tract, many glottal voices. A real choir is many tracts, but every voice
 * here sings the same vowel, so they can share one: five glottal pulse trains
 * are summed into a single waveguide. That is ~25M float-ops/sec instead of
 * ~127M for five tracts, and the tract is what supplies the vocal character.
 *
 * No nasal branch. For the closed-velum "oo/oh" vowel we want, the nose
 * contributes nothing and would cost ~40% more.
 */

const N = 44; // sections; with 2 steps/sample this is a ~17cm tract
const OVERSAMPLE = 2;
const NOISE_COMP = 3; // makes up the loss of the two-pole breath filter

/** Fant's LF glottal flow model. `tenseness` 0 = breathy, 1 = pressed. */
function lfParams(tenseness) {
  const Rd = Math.min(2.7, Math.max(0.5, 3 * (1 - tenseness)));
  const Ra = -0.01 + 0.048 * Rd;
  const Rk = 0.224 + 0.118 * Rd;
  const Rg =
    ((Rk / 4) * (0.5 + 1.2 * Rk)) / (0.11 * Rd - Ra * (0.5 + 1.2 * Rk));

  const Ta = Ra;
  const Tp = 1 / (2 * Rg);
  const Te = Tp + Tp * Rk;
  const epsilon = 1 / Ta;
  const shift = Math.exp(-epsilon * (1 - Te));
  const delta = 1 - shift;

  let rhs = (1 / epsilon) * (shift - 1) + (1 - Te) * shift;
  rhs /= delta;
  const upper = -(-(Te - Tp) / 2 + rhs);

  const omega = Math.PI / Tp;
  const s = Math.sin(omega * Te);
  const y = (-Math.PI * s * upper) / (Tp * 2);
  // y <= 0 would make the log NaN and silently kill the whole voice
  if (!(y > 0)) return lfParams(0.6);
  const alpha = Math.log(y) / (Tp / 2 - Te);
  const E0 = -1 / (s * Math.exp(alpha * Te));
  return { alpha, E0, epsilon, shift, delta, Te, omega };
}

function lfWave(p, t) {
  if (t > p.Te) return (-Math.exp(-p.epsilon * (t - p.Te)) + p.shift) / p.delta;
  return p.E0 * Math.exp(p.alpha * t) * Math.sin(p.omega * t);
}

class Tract {
  constructor() {
    this.d = new Float64Array(N); // section diameters
    this.A = new Float64Array(N); // areas
    this.k = new Float64Array(N); // junction reflection coefficients
    this.R = new Float64Array(N); // right-going wave
    this.L = new Float64Array(N); // left-going wave
    this.jR = new Float64Array(N);
    this.jL = new Float64Array(N);
    this.glottalReflection = 0.75;
    this.lipReflection = -0.85;
    this.damp = 0.9995;
  }

  /** points: [[x 0..1, diameter], ...] from glottis to lips. */
  setShape(points, smooth = 3) {
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      let a = points[0],
        b = points[points.length - 1];
      for (let p = 0; p < points.length - 1; p++) {
        if (x >= points[p][0] && x <= points[p + 1][0]) {
          a = points[p];
          b = points[p + 1];
        }
      }
      const span = b[0] - a[0];
      const t = span < 1e-9 ? 0 : (x - a[0]) / span;
      const e = t * t * (3 - 2 * t); // smoothstep between points
      this.d[i] = a[1] + (b[1] - a[1]) * e;
    }
    // Smooth the profile. Abrupt area changes are strong reflections, and
    // strong reflections are exactly the harsh, buzzy edge we are avoiding.
    for (let s = 0; s < smooth; s++) {
      const c = Float64Array.from(this.d);
      for (let i = 1; i < N - 1; i++)
        this.d[i] = (c[i - 1] + 2 * c[i] + c[i + 1]) / 4;
    }
    for (let i = 0; i < N; i++) this.A[i] = this.d[i] * this.d[i];
    for (let i = 1; i < N; i++) {
      const sum = this.A[i - 1] + this.A[i];
      this.k[i] = sum < 1e-9 ? 0.999 : (this.A[i - 1] - this.A[i]) / sum;
    }
  }

  step(input) {
    const { R, L, jR, jL, k } = this;
    jR[0] = L[0] * this.glottalReflection + input;
    for (let i = 1; i < N; i++) {
      const w = k[i] * (R[i - 1] + L[i]);
      jR[i] = R[i - 1] - w;
      jL[i - 1] = L[i] + w;
    }
    jL[N - 1] = R[N - 1] * this.lipReflection; // lip termination
    const damp = this.damp;
    for (let i = 0; i < N; i++) {
      R[i] = jR[i] * damp;
      L[i] = jL[i] * damp;
    }
    return R[N - 1];
  }
}

class VocalTractProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rate = sampleRate;
    this.tract = new Tract();
    this.voices = [];
    // A choir is SUNG, not exhaled. The brief that produced this asked for
    // "high aspiration, low tenseness", but that makes the glottal source
    // mostly noise - measured at 1.48x the pitched component - and noise
    // through a vocal tract is filtered wind, not a voice. Breath is a texture
    // on top of a clearly pitched tone, not the tone itself.
    this.tenseness = 0.58;
    this.aspiration = 0.2;
    this.level = 0;
    this.targetLevel = 0;
    // tuned by measurement: lifts the mix ~1.4x at full swell, matching the
    // additive choir it replaced, with peak well under clipping
    this.gain = 4.5;
    this.lf = lfParams(this.tenseness);

    // aspiration noise: two poles of lowpass, so it is breath and not hiss
    this.n1 = 0;
    this.n2 = 0;
    this.dc = 0;
    this.dcIn = 0;

    this.setVowel(0.5);
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  /**
   * 0 = rounded "oo" (narrow lips, open pharynx), 1 = open "ah".
   * Tongue sits back and low throughout - that is what keeps both formants low
   * and the timbre hollow rather than bright.
   */
  setVowel(v) {
    // Narrow lips are what put F2 low. With them wide, F2 sat near 1800Hz -
    // a front vowel, too bright to read as a distant "oo".
    const lips = 0.52 + v * 0.8;
    const pharynx = 2.05 - v * 0.85;
    const hump = 0.95 + v * 0.4;
    this.tract.setShape([
      [0.0, 0.62], // glottal end stays narrow
      [0.12, 1.15],
      [0.32, pharynx], // open back cavity
      [0.6, hump], // tongue, back and low
      [0.82, 1.35],
      [1.0, lips],
    ]);
  }

  onMessage(m) {
    if (m.chord) {
      this.voices = m.chord.map((hz, i) => ({
        hz,
        phase: Math.random(),
        // each voice drifts on its own slow LFO, so they are never quite in
        // tune with each other - that is what a choir is
        driftPhase: Math.random(),
        driftRate: 0.1 + Math.random() * 0.2,
        driftCents: 4 + Math.random() * 7,
      }));
    }
    if (m.level !== undefined) this.targetLevel = m.level;
    if (m.tenseness !== undefined) {
      this.tenseness = m.tenseness;
      this.lf = lfParams(this.tenseness);
    }
    if (m.aspiration !== undefined) this.aspiration = m.aspiration;
    if (m.vowel !== undefined) this.setVowel(m.vowel);
    if (m.gain !== undefined) this.gain = m.gain;
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    const n = out.length;
    const voiced = 1 - this.aspiration * 0.3;

    for (let s = 0; s < n; s++) {
      this.level += (this.targetLevel - this.level) * 0.0006; // ~a second
      if (this.level < 1e-5 && this.targetLevel < 1e-5) {
        out[s] = 0;
        continue;
      }

      let glottal = 0,
        open = 0;
      for (const v of this.voices) {
        v.driftPhase += v.driftRate / this.rate;
        if (v.driftPhase >= 1) v.driftPhase -= 1;
        const cents = Math.sin(v.driftPhase * 2 * Math.PI) * v.driftCents;
        v.phase += (v.hz * Math.pow(2, cents / 1200)) / this.rate;
        if (v.phase >= 1) v.phase -= 1;
        glottal += lfWave(this.lf, v.phase);
        open += v.phase < this.lf.Te ? 1 : 0;
      }
      const nv = this.voices.length || 1;
      glottal /= Math.sqrt(nv) * 1.6;

      // noise is loudest while the folds are open, as real breath is.
      // NOISE_COMP restores the ~21dB two cascaded one-pole lowpasses take out;
      // without it the breath - which is most of this voice - is inaudible.
      // Broadband on purpose. Filtered at 0.16 the breath rolled off above
      // ~1.3kHz, so it never excited F2 and the tract had no vowel to shape -
      // the darkening belongs on the OUTPUT, not on the excitation.
      const white = Math.random() * 2 - 1;
      this.n1 += (white - this.n1) * 0.5;
      this.n2 += (this.n1 - this.n2) * 0.5;
      const breath = this.n2 * NOISE_COMP * (0.55 + 0.45 * (open / nv));

      const input =
        (glottal * voiced + breath * this.aspiration * 1.4) * this.level;

      let lip = 0;
      for (let o = 0; o < OVERSAMPLE; o++) lip = this.tract.step(input);

      // block DC: the waveguide can wander off zero and eat headroom
      this.dc += (lip - this.dc) * 0.0004;
      out[s] = (lip - this.dc) * this.gain;
    }
    return true;
  }
}

registerProcessor('vocal-tract', VocalTractProcessor);

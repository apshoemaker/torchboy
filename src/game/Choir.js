import * as THREE from 'three';

/**
 * The choir: a physically-modelled vocal tract washed into a distant cloud.
 *
 * Owns the AudioWorklet (see src/audio/vocal-tract-processor.js) plus the
 * effects chain around it. The worklet is a real waveguide vocal tract, which
 * is what gives this formants that move and interact - a stack of sines cannot
 * do that however carefully it is filtered.
 *
 * init() resolves false if AudioWorklet is unavailable or the module fails to
 * load, and the caller keeps its simpler fallback. Audio is a nicety; it must
 * never be the reason the game does not start.
 */

// sus2/add9 over the level's root: open fifths and seconds, no third, so it
// floats over the minor drone without committing to major or minor
const CHORD = [12, 14, 19, 24, 26];

export class Choir {
  constructor() {
    this.ready = false;
    this.node = null;
    this._level = 0;
  }

  async init(ctx, { reverbSend, dryOut }) {
    if (!ctx.audioWorklet) return false;
    try {
      const url = new URL('../audio/vocal-tract-processor.js', import.meta.url);
      await ctx.audioWorklet.addModule(url);
      this.node = new AudioWorkletNode(ctx, 'vocal-tract', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      });
    } catch (e) {
      console.warn('[choir] vocal tract unavailable, using fallback:', e.message);
      return false;
    }

    this.ctx = ctx;

    // ---- roll everything above 1.5kHz away. The tract's lip output is a
    // pressure wave and is naturally bright; unfiltered it buzzes.
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    // The cutoff has to sit ABOVE F2 or the vowel stops being a vowel. At
    // 900Hz this filtered away everything but F1, and what was left read as a
    // muffled whoosh. The shelf still keeps the top dark.
    this.tone.frequency.value = 1150;
    this.tone.Q.value = 0.3;

    const ceiling = ctx.createBiquadFilter();
    ceiling.type = 'highshelf';
    ceiling.frequency.value = 2600;
    ceiling.gain.value = -12;

    // ---- ensemble: three modulated taps turn one tract into a section.
    // Cheaper and smoother than running three tracts, and detuning by delay is
    // exactly how a real ensemble smears - no two singers are ever in phase.
    const spread = ctx.createGain();
    this.node.connect(this.tone);
    this.tone.connect(ceiling);
    ceiling.connect(spread);

    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    this.dry = ctx.createGain();
    this.dry.gain.value = 0;

    const merge = ctx.createGain();
    for (const [ms, rate, pan] of [[17, 0.11, -0.7], [26, 0.083, 0.15], [34, 0.067, 0.75]]) {
      const dl = ctx.createDelay(0.1);
      dl.delayTime.value = ms / 1000;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const amt = ctx.createGain();
      amt.gain.value = 0.0022;                // ±2.2ms: detune, not vibrato
      lfo.connect(amt); amt.connect(dl.delayTime); lfo.start();
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const g = ctx.createGain();
      g.gain.value = 0.55;
      spread.connect(dl); dl.connect(g);
      if (p) { g.connect(p); p.pan.value = pan; p.connect(merge); } else g.connect(merge);
    }
    spread.connect(merge);                    // a little of the centre, undelayed

    merge.connect(this.wet);
    merge.connect(this.dry);
    this.wet.connect(reverbSend);
    this.dry.connect(dryOut);

    this.node.port.postMessage({
      tenseness: 0.58,      // sung, with a defined glottal pulse
      aspiration: 0.20,     // breath as a texture, not as the source
      vowel: 0.30,          // rounded, between "oo" and "oh"
      level: 0,
    });
    this.ready = true;
    return true;
  }

  setRoot(rootHz) {
    if (!this.ready) return;
    this.node.port.postMessage({
      chord: CHORD.map((s) => rootHz * Math.pow(2, s / 12) * 8),
    });
  }

  /**
   * @param swell 0..1 crescendo
   * @param cold  0..1 how much of it is a hidden passage rather than an ember
   */
  set(swell, cold) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // Overwhelmingly reverb. The dry, present component only appears close in,
    // so the sound walks out of the dark rather than just getting louder.
    this.wet.gain.setTargetAtTime(swell * 0.5, t, 2.0);
    this.dry.gain.setTargetAtTime(Math.max(0, swell - 0.45) * 0.22, t, 2.0);
    this.tone.frequency.setTargetAtTime(1150 + swell * 1100, t, 1.8);
    // a passage opens the vowel and tightens the folds slightly - colder, more
    // voiced; an ember leaves it breathy and round
    this.node.port.postMessage({
      level: swell,
      vowel: 0.30 + cold * 0.26,
      tenseness: 0.58 + cold * 0.10,
    });
  }
}

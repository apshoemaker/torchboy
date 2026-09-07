/**
 * A generated ambient score for the cavern.
 *
 * Nothing here is a sound file. The whole thing is synthesised live with the
 * Web Audio API, for three reasons:
 *   - it never loops, so an hour of searching never gets a repeat
 *   - it costs no download, which matters when the cavern glb is already 2.4MB
 *   - it can READ THE GAME. The score darkens as you descend and turns cold
 *     and shimmering as the torch senses a hidden way, so the music is part of
 *     the same hot/cold hunt the flame and the HUD are playing.
 *
 * The musical idea is deliberately un-insistent: a slow drone and a wandering
 * pentatonic line with no strong resolution. Nothing states a beat, and there
 * are no sharp transients anywhere - every voice fades in over at least a
 * second. A percussive "drip" voice was tried and cut: at ambient volume its
 * 5ms attack read as a click rather than as water.
 */

// Minor hexatonic. No leading tone, so no phrase ever demands a resolution -
// which is what lets the line meander indefinitely without sounding unfinished.
const SCALE = [0, 2, 3, 5, 7, 10];

// One root per level, descending. Going deeper literally lowers the music.
const ROOTS = [55.0, 48.99, 43.65]; // A1, G1, F1

import { Choir } from './Choir.js';

const noteHz = (root, semis) => root * Math.pow(2, semis / 12);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Exponentially decaying noise: a cheap cave reverb tail.
 *
 * The noise is LOWPASSED as it is generated. Built from raw white noise the
 * tail is grainy - it measures as sample-to-sample jumps of ~80% of peak, and
 * hears as a fizz on every note, which is the opposite of soft. A one-pole
 * filter at roughly 1.9kHz makes the tail dark and smooth, which is also what
 * a real cave does to a reflection.
 */
function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += (Math.random() * 2 - 1 - lp) * 0.22;
      d[i] = lp * Math.pow(1 - t, decay);
    }
    let max = 0;
    for (let i = 0; i < len; i++) max = Math.max(max, Math.abs(d[i]));
    if (max > 0) for (let i = 0; i < len; i++) d[i] /= max;
  }
  return buf;
}

function makeNoise(ctx, seconds) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const fade = Math.floor(rate * 0.4);

  // Generate a little MORE than we need, then crossfade the overhang back over
  // the head. A looping buffer whose first and last samples differ steps at the
  // loop point, and a step through the downstream bandpass is an audible click
  // every time round - a periodic tick with no obvious source.
  const tmp = new Float32Array(len + fade);
  let last = 0;
  for (let i = 0; i < tmp.length; i++) {
    last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995; // brown-ish: dark, not hissy
    tmp[i] = last;
  }

  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = tmp[i];
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    d[i] = tmp[i] * t + tmp[len + i] * (1 - t);
  }

  let max = 0;
  for (let i = 0; i < len; i++) max = Math.max(max, Math.abs(d[i]));
  if (max > 0) for (let i = 0; i < len; i++) d[i] /= max;
  return buf;
}

export class Ambience {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.failed = false;
    this.usingVocalTract = false;
    this.level = 0;
    this.proximity = 0;
    this._prox = 0;
    this._wonder = 0;
    this.muted = localStorage.getItem('torchboy.muted') === '1';
    this.volume = 0.85;
    this._nextNote = 0;
    this._degree = 0;
    this._t = 0;
  }

  /** Must be called from a user gesture - browsers refuse audio before one. */
  async start() {
    if (this.ctx || this.failed) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        this.failed = true;
        return;
      }
      const ctx = (this.ctx = new AC());
      if (ctx.state === 'suspended') await ctx.resume();
      this._build();

      // Try the physically-modelled vocal tract first. If the worklet cannot
      // load, fall back to the additive choir - worse, but it always works.
      this.choir = new Choir();
      const ok = await this.choir.init(ctx, {
        reverbSend: this.reverbSend,
        dryOut: this.bright,
      });
      if (ok) this.choir.setRoot(ROOTS[this.level]);
      else this._buildChoir();
      this.usingVocalTract = ok;

      this.ready = true;
      this._nextNote = ctx.currentTime + 2.0;
    } catch (e) {
      // audio is a nicety; never let it take the game down with it
      console.warn('[ambience] disabled:', e.message);
      this.failed = true;
    }
  }

  _build() {
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume * 0.26;
    this.master.connect(ctx.destination);

    // gentle limiter so a chime landing on a drone swell never spikes
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 6;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;
    comp.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 5.5, 2.6);
    const preDelay = ctx.createDelay(0.2);
    preDelay.delayTime.value = 0.045;
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    preDelay.connect(this.reverb);
    this.reverb.connect(wet);
    wet.connect(comp);
    this.reverbSend = preDelay; // anything wanting to sound far off

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.55;
    this.dry.connect(comp);

    // Two buses. `bus` is the dark bed - drone, air, the wandering line - and
    // runs through a lowpass that closes down to keep the cave muffled.
    // `bright` bypasses that filter entirely, for the sounds that must sparkle:
    // the cold shimmer and the discovery chime. Routing everything
    // through one filter muted them to nothing (measured: zero energy above
    // 1.5kHz even at full shimmer).
    this.bus = ctx.createGain();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 900;
    this.tone.Q.value = 0.6;
    this.bus.connect(this.tone);
    this.tone.connect(this.dry);
    this.tone.connect(preDelay);

    this.bright = ctx.createGain();
    this.bright.gain.value = 0.9;
    this.bright.connect(this.dry);
    this.bright.connect(preDelay);

    this._buildDrone();
    this._buildAir();
  }

  /** Three detuned voices on the root. Slow, and never quite in phase. */
  _buildDrone() {
    const ctx = this.ctx;
    const root = ROOTS[0];
    this.drone = { oscs: [], gains: [] };
    const parts = [
      { mult: 1, type: 'sine', gain: 0.3, detune: -4 },
      { mult: 2, type: 'sine', gain: 0.16, detune: +5 },
      { mult: 3, type: 'triangle', gain: 0.055, detune: -7 },
    ];
    for (const part of parts) {
      const osc = ctx.createOscillator();
      osc.type = part.type;
      osc.frequency.value = root * part.mult;
      osc.detune.value = part.detune;

      const g = ctx.createGain();
      g.gain.value = part.gain;

      // an LFO per voice, at incommensurate rates, so the drone breathes
      // without ever settling into an audible cycle
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.021 + Math.random() * 0.035;
      const lfoAmt = ctx.createGain();
      lfoAmt.gain.value = part.gain * 0.55;
      lfo.connect(lfoAmt);
      lfoAmt.connect(g.gain);
      lfo.start();

      osc.connect(g);
      g.connect(this.bus);
      osc.start();
      this.drone.oscs.push(osc);
      this.drone.gains.push(g);
    }
  }

  /** A bed of moving air, filtered and slowly swept. */
  _buildAir() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, 8);
    src.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 260;
    band.Q.value = 0.8;

    // a second, fixed lowpass guarantees the bed can never hiss, whatever the
    // sweep is doing - this is meant to be felt more than heard
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 620;

    const g = ctx.createGain();
    g.gain.value = 0.32;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.035;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 110;
    lfo.connect(lfoAmt);
    lfoAmt.connect(band.frequency);
    lfo.start();

    src.connect(band);
    band.connect(damp);
    damp.connect(g);
    g.connect(this.bus);
    src.start();
    this.air = { src, band, damp, gain: g };
  }

  /**
   * A distant choir, silent until something worth finding is near.
   *
   * Three things make this read as voices rather than as a synth pad:
   *   - every chord tone is TWO oscillators detuned a few cents apart. That
   *     beating is most of what makes a choir sound like more than one person.
   *   - a peaking filter around 900Hz stands in for a vocal formant, giving the
   *     sound a throat instead of a speaker.
   *   - each voice breathes on its own slow LFO at an unrelated rate, so they
   *     drift in and out of phase the way real held notes do.
   *
   * The voicing is a sus2/add9 stack - open fifths and seconds, no third. It
   * sits over the minor drone without committing to major or minor, which is
   * what keeps it luminous rather than sweet.
   */
  _buildChoir() {
    const ctx = this.ctx;
    const root = ROOTS[0];

    this.choir = { oscs: [], semis: [12, 14, 19, 24, 26] };

    // "on the horizon": the choir is nearly all reverb when far off, and gains
    // a dry, present component only as it swells. Distance you can hear.
    this.choirWet = ctx.createGain();
    this.choirWet.gain.value = 0;
    this.choirDry = ctx.createGain();
    this.choirDry.gain.value = 0;

    const formant = ctx.createBiquadFilter();
    formant.type = 'peaking';
    formant.frequency.value = 820;
    formant.Q.value = 0.65;
    formant.gain.value = 2.5; // a hint of throat; +6dB here was a shout

    this.choirTone = ctx.createBiquadFilter();
    this.choirTone.type = 'lowpass';
    this.choirTone.frequency.value = 900;
    this.choirTone.Q.value = 0.3; // no resonant lip on the cutoff

    const airCut = ctx.createBiquadFilter();
    airCut.type = 'highshelf';
    airCut.frequency.value = 2200;
    airCut.gain.value = -12; // permanent ceiling on the sizzle

    const sum = ctx.createGain();
    sum.gain.value = 1;
    sum.connect(formant);
    formant.connect(airCut);
    airCut.connect(this.choirTone);
    this.choirTone.connect(this.choirWet);
    this.choirTone.connect(this.choirDry);
    this.choirWet.connect(this.reverbSend);
    this.choirDry.connect(this.bright);

    this.choir.semis.forEach((semis, i) => {
      const base = noteHz(root, semis) * 8;
      const voice = ctx.createGain();
      // The upper voices roll off HARD. They are the ones that read as sharp,
      // and an ethereal sound is mostly its lowest partials with the rest
      // implied above them.
      voice.gain.value = 0.85 / (1 + i * 1.15);
      voice.connect(sum);

      const breath = ctx.createOscillator();
      breath.frequency.value = 0.06 + i * 0.031 + Math.random() * 0.02;
      const breathAmt = ctx.createGain();
      breathAmt.gain.value = voice.gain.value * 0.42;
      breath.connect(breathAmt);
      breathAmt.connect(voice.gain);
      breath.start();

      for (const cents of [-4, +4]) {
        // gentle beating, not a wobble
        const osc = ctx.createOscillator();
        osc.type = 'sine'; // triangles gave it an edge; ethereal wants none
        osc.frequency.value = base;
        osc.detune.value = cents + (Math.random() - 0.5) * 4;
        const g = ctx.createGain();
        g.gain.value = 0.5;
        osc.connect(g);
        g.connect(voice);
        osc.start();
        this.choir.oscs.push({ osc, semis });
      }
    });
  }

  // ---------------------------------------------------------------- voices
  _note(freq, when, dur, amp, pan = 0, type = 'sine', dest = null) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 8;

    const g = ctx.createGain();
    const attack = Math.max(0.35, Math.min(1.6, dur * 0.35)); // never fast enough to click
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(amp, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) p.pan.value = pan;

    const out = dest || this.bus;
    osc.connect(g);
    if (p) {
      g.connect(p);
      p.connect(out);
    } else g.connect(out);
    osc.start(when);
    osc.stop(when + dur + 0.1);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      if (p) p.disconnect();
    };
  }

  // ---------------------------------------------------------------- events
  /** A passage opened: a rising figure that finally resolves. */
  discovery() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const root = ROOTS[this.level] * 4;
    [0, 5, 7, 12].forEach((s, i) => {
      this._note(
        noteHz(root, s),
        t + i * 0.16,
        2.6 - i * 0.2,
        0.1,
        (i - 1.5) * 0.3,
        'triangle',
        this.bright,
      );
    });
  }

  /** Something ancient enters him: a cold figure that rises and then lands. */
  bestow() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const root = ROOTS[this.level] * 8;
    // rising fourths, arriving on the octave as the light goes in
    [0, 5, 10, 12].forEach((s, i) => {
      this._note(
        noteHz(root, s),
        t + i * 0.18,
        2.2,
        0.055,
        (i - 1.5) * 0.35,
        'sine',
        this.bright,
      );
    });
    // a low swell underneath so it has weight
    this._note(noteHz(ROOTS[this.level] * 2, 0), t + 0.5, 3.4, 0.05, 0, 'sine');
  }

  /** An ember taken: one soft affirmative note. */
  pickup() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this._note(
      noteHz(ROOTS[this.level] * 4, 7),
      t,
      1.6,
      0.075,
      0,
      'sine',
      this.bright,
    );
  }

  setLevel(i) {
    this.level = i;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const root = ROOTS[i] || ROOTS[ROOTS.length - 1];
    // glide rather than jump: the descent should feel continuous
    this.drone.oscs.forEach((osc, k) => {
      const mult = [1, 2, 3][k];
      osc.frequency.setTargetAtTime(root * mult, t, 2.5);
    });
    if (this.usingVocalTract) this.choir.setRoot(root);
    else
      this.choir.oscs.forEach(({ osc, semis }) => {
        osc.frequency.setTargetAtTime(noteHz(root, semis) * 8, t, 2.5);
      });
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('torchboy.muted', m ? '1' : '0');
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(m ? 0 : this.volume * 0.26, t, 0.12);
  }

  toggle() {
    this.setMuted(!this.muted);
    return !this.muted;
  }

  /**
   * @param proximity 0..1 - how strongly the torch senses a hidden PASSAGE.
   *                  Colours the choir cold and opens the bed's filter.
   * @param wonder    0..1 - how near ANYTHING worth finding is, passages and
   *                  embers alike. Drives the choir's crescendo.
   */
  update(dt, proximity = 0, wonder = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this._t += dt;
    this._prox += (proximity - this._prox) * Math.min(1, dt * 1.5);
    this._wonder += (wonder - this._wonder) * Math.min(1, dt * 1.2);
    const p = this._prox;
    const w = this._wonder;

    // ---- the choir crescendos as he closes on something.
    // Smoothstep, not a square: squaring keeps it near-silent for most of the
    // walk in and then lurches at the end. Smoothstep eases away from zero at
    // the edge of range and eases into full at the centre, so the whole
    // approach is a swell rather than a sudden arrival.
    const swell = w * w * (3 - 2 * w);
    // far off it is nearly pure reverb; the dry, present component only arrives
    // as he gets close, so the sound walks toward him
    // Quiet, and overwhelmingly reverb even at its peak. The dry component is
    // only ever a trace: the moment it becomes present it stops being ethereal
    // and turns into a synth pad sitting on top of the mix.
    if (this.usingVocalTract) {
      this.choir.set(swell, p);
    } else {
      this.choirWet.gain.setTargetAtTime(swell * 0.46, now, 2.0);
      this.choirDry.gain.setTargetAtTime(
        Math.max(0, swell - 0.45) * 0.2,
        now,
        2.0,
      );
      this.choirTone.frequency.setTargetAtTime(lerp(680, 1650, w), now, 1.8);
      const spread = 4 + p * 6;
      this.choir.oscs.forEach(({ osc }, i) => {
        osc.detune.setTargetAtTime(i % 2 ? spread : -spread, now, 2.0);
      });
    }

    this.tone.frequency.setTargetAtTime(lerp(760, 2100, p), now, 0.7);
    this.air.gain.gain.setTargetAtTime(lerp(0.32, 0.14, p), now, 0.8);

    // ---- the meandering line
    if (now >= this._nextNote) {
      // random walk over scale degrees: mostly steps, occasionally a leap.
      // A walk wanders; independent random picks just sound arbitrary.
      const leap = Math.random() < 0.18;
      this._degree += leap
        ? Math.random() < 0.5
          ? -3
          : 3
        : Math.random() < 0.5
          ? -1
          : 1;
      this._degree = Math.max(-7, Math.min(9, this._degree));

      const oct = 3 + (Math.random() < 0.3 ? 1 : 0) + (p > 0.5 ? 1 : 0);
      const idx = ((this._degree % SCALE.length) + SCALE.length) % SCALE.length;
      const semis = SCALE[idx] + 12 * Math.floor(this._degree / SCALE.length);
      const freq = noteHz(ROOTS[this.level] * Math.pow(2, oct - 1), semis);

      const dur = 3.4 + Math.random() * 3.4;
      this._note(
        freq,
        now + 0.05,
        dur,
        0.055 + p * 0.02,
        (Math.random() - 0.5) * 1.2,
        'sine',
      );
      // a quiet fifth below, sometimes, for body
      if (Math.random() < 0.35) {
        this._note(
          freq * 0.5 * Math.pow(2, 7 / 12),
          now + 0.4,
          dur * 0.8,
          0.03,
          (Math.random() - 0.5) * 0.8,
          'sine',
        );
      }
      // gaps shorten a little when something is close, but never become a pulse
      this._nextNote = now + lerp(4.6, 2.8, p) + Math.random() * 3.6;
    }
  }
}

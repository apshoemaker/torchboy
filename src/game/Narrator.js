/**
 * Torchboy's story, written while it is being played.
 *
 * Nothing is written up front. Each beat is generated from the chronicle of
 * what he has actually done - how far he has walked with nothing to show for
 * it, that he stood at a cold wall and moved on, which cavern he has climbed
 * into - and from everything already told, so the narrative continues rather
 * than restarts. The premise is fixed and authored server-side: the cave, the
 * torch, the darkness in his heart, the light he is climbing toward. No
 * backstory is invented on top of it.
 *
 * Beats are PREFETCHED: the moment one is shown, the next is requested. A beat
 * takes ~3s to write and surfaces every ~40 paces, so the wait never shows.
 */

const MIN_WALK = 34;
const WALK_SPREAD = 26;

// Used when there is no API key, or the network fails. Static, so the story
// stops responding to play - but the game still narrates.
// These must hold to the same premise the model is given: no relatives, no
// keepsakes, no life above the ground. Only the cave, the torch, the light he
// is climbing toward, and the thing in him he cannot account for.
const FALLBACK = [
  'He did not remember coming down here, and had stopped expecting to.',
  'There were doors in the dark that were not doors until you stood close enough.',
  'The flame leaned when the rock was lying. He had learned to trust it more than his eyes.',
  'He was not lost. Being lost requires somewhere you meant to be.',
  'Something sat in his chest that the cold did not explain. He kept walking.',
  'Somewhere above, the dark thinned. He climbed toward it because it was the only direction left.',
];
const FALLBACK_REV = [
  { knowledge: 'The stone remembers weight better than it remembers the ones who carried it.',
    response: 'He thinks of how little he weighs, and is not comforted.' },
  { knowledge: 'Every way sealed down here was sealed from the inside.',
    response: 'He looks at his own hands, and does not finish the thought.' },
  { knowledge: 'To seal a door you must first convince yourself there was never a door.',
    response: 'He has been telling himself something since he got here. He stops.' },
  { knowledge: 'The dark is not empty. It is occupied, and it has been patient.',
    response: 'He wants the light more than he did an hour ago, and likes himself less for it.' },
];

export class Narrator {
  constructor(hud, chronicle) {
    this.hud = hud;
    this.chronicle = chronicle;
    this.told = [];               // everything shown, in order - the memory
    this.live = false;            // is the model actually answering?
    this.ready = false;
    this.title = 'Torchboy';

    this.pending = { beat: null, revelation: null };
    this.inFlight = { beat: false, revelation: false };
    this.fallbackAt = 0;
    this.fallbackRevAt = 0;

    this.t = 0;
    this.walked = 0;
    this.nextAt = 14;
    this.holdUntil = 0;
    this._lastPos = null;
    this._pendingResponse = null;
  }

  // ---------------------------------------------------------------- network
  async _ask(want) {
    const body = {
      want,
      told: this.told,
      events: this.chronicle.drain(),
      summary: this.summary || '',
    };
    const res = await fetch('/api/story/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  /** Keep one beat and one revelation queued so neither ever waits on the wire. */
  prefetch() {
    // Nothing is seeded, so the FIRST beat is what invents the person, the
    // object and the reason - everything after it is a continuation. Firing a
    // revelation alongside it would send two requests with an empty story and
    // get back two unrelated inventions, so the revelation waits until there
    // is a story to continue. A discovery before then uses a written one.
    const wants = this.told.length ? ['beat', 'revelation'] : ['beat'];
    for (const want of wants) {
      if (this.pending[want] || this.inFlight[want]) continue;
      this.inFlight[want] = true;
      this._ask(want)
        .then((d) => {
          this.pending[want] = want === 'revelation'
            ? { knowledge: d.knowledge, response: d.response }
            : d.text;
          this.live = true;
          this.ready = true;
        })
        .catch((e) => {
          if (!this.ready) console.warn('[story] falling back:', e.message);
          this.live = false;
          this.ready = true;
        })
        .finally(() => { this.inFlight[want] = false; });
    }
  }

  /** Kick the first request. Never blocks the game. */
  start(summary) {
    this.summary = summary;
    this.prefetch();
  }

  // ------------------------------------------------------------------ beats
  _takeBeat() {
    if (this.pending.beat) {
      const t = this.pending.beat;
      this.pending.beat = null;
      return t;
    }
    if (this.fallbackAt < FALLBACK.length) return FALLBACK[this.fallbackAt++];
    return null;
  }

  reveal(force = false) {
    if (!force && this.t < this.holdUntil) return false;
    const text = this._takeBeat();
    if (!text) { this.prefetch(); return false; }
    this.hud.narrate(text);
    this.told.push({ kind: 'beat', text });
    this.holdUntil = this.t + 9;
    this.walked = 0;
    this.nextAt = MIN_WALK + Math.random() * WALK_SPREAD;
    this.prefetch();
    return true;
  }

  /** What the dark hands him on a discovery; his response follows a beat later. */
  nextRevelation() {
    let r = this.pending.revelation;
    if (r) this.pending.revelation = null;
    else if (this.fallbackRevAt < FALLBACK_REV.length) r = FALLBACK_REV[this.fallbackRevAt++];
    if (!r) { this.prefetch(); return null; }

    this.told.push({ kind: 'revelation', text: r.knowledge });
    if (r.response) {
      this._pendingResponse = { text: r.response, at: this.t + 5.2 };
    }
    this.holdUntil = this.t + 11;
    this.prefetch();
    return r.knowledge;
  }

  /** The end: one last generated passage that lands the arc. */
  async finish() {
    this.hud.ending(this.title, '…');
    try {
      const d = await this._ask('ending');
      this.hud.ending(this.title, d.text);
      this.told.push({ kind: 'ending', text: d.text });
    } catch {
      const last = this.told.filter((t) => t.kind === 'beat').pop();
      this.hud.ending(this.title,
        last ? last.text : 'He walked into the light, and did not look back.');
    }
  }

  update(dt, pos, busy, summary) {
    this.t += dt;
    if (summary) this.summary = summary;
    if (this._lastPos) {
      const d = Math.hypot(pos.x - this._lastPos.x, pos.z - this._lastPos.z);
      this.walked += d;
      this.chronicle.addWalk(d);
    }
    this._lastPos = { x: pos.x, z: pos.z };

    if (this._pendingResponse && this.t >= this._pendingResponse.at) {
      const { text } = this._pendingResponse;
      this.hud.narrate(text);
      this.told.push({ kind: 'response', text });
      this._pendingResponse = null;
      this.holdUntil = this.t + 8;
    }

    if (busy) return;
    if (this.walked >= this.nextAt && this.t >= this.holdUntil) this.reveal();
  }
}

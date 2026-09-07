/** DOM overlay: fuel, level name, discoveries, toasts, and the fade. */
export class HUD {
  constructor() {
    this.el = {
      sense: document.getElementById('sense-fill'),
      senseWrap: document.getElementById('sense'),
      embers: document.getElementById('embers'),
      level: document.getElementById('level-name'),
      found: document.getElementById('found'),
      toast: document.getElementById('toast'),
      fade: document.getElementById('fade'),
      hint: document.getElementById('hint'),
      loading: document.getElementById('loading'),
      sound: document.getElementById('sound'),
      mapLabel: document.getElementById('map-label'),
      ending: document.getElementById('ending'),
      endingTitle: document.getElementById('ending-title'),
      endingText: document.getElementById('ending-text'),
      restart: document.getElementById('restart'),
      narration: document.getElementById('narration'),
    };
    this._toastT = 0;
    this._narrateT = 0;
    this._restartT = 0;
  }

  setLevel(name, index, total) {
    this.el.level.textContent = `${index + 1}/${total} · ${name}`;
    if (this.el.mapLabel) this.el.mapLabel.textContent = `${index + 1}/${total}`;
  }

  setFound(found, total) {
    this.el.found.textContent = `${found}/${total}`;
  }

  /** The sense meter: how strongly the flame is reacting to a hidden way. */
  setSense(prox, embers) {
    this.el.sense.style.width = `${Math.max(0, prox) * 100}%`;
    this.el.senseWrap.classList.toggle('warm', prox > 0.05);
    this.el.senseWrap.classList.toggle('hot', prox > 0.72);
    this.el.embers.textContent = embers;
  }

  /** Story narration. Held far longer than a toast - it is meant to be read. */
  narrate(text, kind = 'memory') {
    if (!this.el.narration) return;
    this.el.narration.textContent = text;
    this.el.narration.classList.toggle('revelation', kind === 'revelation');
    this.el.narration.classList.add('show');
    this._narrateT = 7.5 + text.length * 0.035;   // longer lines linger longer
  }

  /** What the dark hands him. Colder, and it holds longer. */
  revelation(text) {
    this.narrate(text, 'revelation');
    this._narrateT += 2.5;
  }

  toast(msg, seconds = 2.6) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    this._toastT = seconds;
  }

  hint(msg) {
    this.el.hint.textContent = msg || '';
    this.el.hint.classList.toggle('show', !!msg);
  }

  setMuted(muted) {
    if (!this.el.sound) return;
    this.el.sound.textContent = muted ? 'sound off' : 'sound on';
    this.el.sound.classList.toggle('off', muted);
  }

  fade(alpha) { this.el.fade.style.opacity = alpha; }

  /** The ending fades to daylight rather than to black. */
  whiteout(alpha) {
    this.el.fade.classList.add('light');
    this.el.fade.style.opacity = alpha;
  }

  /** Clear the interface away - nothing but the light and the last words. */
  enterEnding() {
    document.getElementById('hud')?.classList.add('ended');
  }

  ending(title, text) {
    if (!this.el.ending) return;
    this.el.endingTitle.textContent = title || '';
    this.el.endingText.textContent = text || '';
    this.el.ending.classList.add('show');
    this.el.narration.classList.remove('show');
    // The last passage is still being written when this is first called with a
    // placeholder, so only start the clock once the real text has landed.
    if (text && text !== '…') this._armRestart(text);
  }

  /**
   * Show the way back in, but not straight away - the whole point of the end
   * card is the last thing the story says, and a button under it while it is
   * still being read is an invitation to stop reading. Long endings get longer.
   */
  _armRestart(text) {
    const btn = this.el.restart;
    if (!btn || this._restartT) return;
    const delay = Math.min(11, Math.max(5, 5 + text.length * 0.02)) * 1000;
    this._restartT = setTimeout(() => btn.classList.add('show'), delay);
  }

  /** @param fn what to do when the reader wants to go back down. */
  onRestart(fn) {
    if (this.el.restart) this.el.restart.addEventListener('click', fn);
  }

  ready() { this.el.loading.classList.add('gone'); }

  progress(p, label) {
    const bar = this.el.loading.querySelector('.bar span');
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    const t = this.el.loading.querySelector('.what');
    if (t && label) t.textContent = label;
  }

  update(dt) {
    if (this._narrateT > 0) {
      this._narrateT -= dt;
      if (this._narrateT <= 0) this.el.narration.classList.remove('show');
    }
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this.el.toast.classList.remove('show');
    }
  }
}

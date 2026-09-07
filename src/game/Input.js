/** Keyboard + on-screen thumbstick, normalised to a single {x, y} vector. */
export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.pad = { x: 0, y: 0, active: false };
    this.onAction = () => {};
    this._orbit = 0;            // mouse-drag radians accrued since the last read
    this.dragging = false;

    addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'KeyE') this.onAction();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // ---- mouse drag pivots the camera around him.
    // Bound to mouse events only; touch drag still steers movement, so the two
    // never fight over the same gesture.
    const ORBIT_PER_PX = 0.006;
    let lastX = 0;
    dom.style.cursor = 'grab';
    dom.addEventListener('mousedown', (e) => {
      this.dragging = true;
      lastX = e.clientX;
      dom.style.cursor = 'grabbing';
      e.preventDefault();
    });
    addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this._orbit += (e.clientX - lastX) * ORBIT_PER_PX;
      lastX = e.clientX;
    });
    const endDrag = () => {
      if (!this.dragging) return;
      this.dragging = false;
      dom.style.cursor = 'grab';
    };
    addEventListener('mouseup', endDrag);
    addEventListener('blur', endDrag);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    // touch: drag anywhere to steer
    let origin = null;
    const start = (e) => {
      const t = e.touches ? e.touches[0] : e;
      origin = { x: t.clientX, y: t.clientY };
      this.pad.active = true;
    };
    const move = (e) => {
      if (!origin) return;
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - origin.x, dy = t.clientY - origin.y;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(len, 60) / 60 / len;
      this.pad.x = dx * k; this.pad.y = dy * k;
      e.preventDefault();
    };
    const end = () => { origin = null; this.pad.x = this.pad.y = 0; this.pad.active = false; };
    dom.addEventListener('touchstart', start, { passive: true });
    dom.addEventListener('touchmove', move, { passive: false });
    dom.addEventListener('touchend', end);
  }

  /** Radians of pivot accrued since the last call, then reset. */
  takeOrbit() {
    const o = this._orbit;
    this._orbit = 0;
    return o;
  }

  /** Keyboard pivot, in radians per second (held, so it must be rate-based). */
  orbitRate() {
    let r = 0;
    if (this.keys.has('KeyQ')) r -= 1;
    if (this.keys.has('KeyE')) r += 1;
    return r * 1.9;
  }

  /** @returns {{x:number, y:number}} y is "up the screen" */
  axis() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (this.pad.active) { x += this.pad.x; y -= this.pad.y; }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }
}

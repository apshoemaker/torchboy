/**
 * What Torchboy has actually done, in words a model can use.
 *
 * The narration is no longer written up front - it is generated as he plays,
 * from this log. So the story has to know things the game knows: how far he has
 * walked without finding anything, that he stood at a cold wall and then walked
 * away from it, that he has doubled back, how deep he still is.
 *
 * Events are phrased as plain observations rather than as game state. The model
 * is being told what happened, not handed a scoreboard.
 */
export class Chronicle {
  constructor() {
    this.events = [];        // unconsumed - handed to the next generation
    this.all = [];           // everything, for the ending
    this.walked = 0;
    this.sinceFind = 0;
    this.visited = new Set();
    this._teased = 0;
    this._lastTile = null;
    this._revisits = 0;
  }

  note(text) {
    this.events.push(text);
    this.all.push(text);
    if (this.events.length > 14) this.events.shift();
  }

  /** @returns the events since the last call, and clears them */
  drain() {
    const e = this.events.slice();
    this.events.length = 0;
    return e;
  }

  // ------------------------------------------------------------------ hooks
  wakes(levelName, depth, total) {
    this.note(`he wakes on the ${depth} of ${total} levels down, in ${levelName}`);
  }

  climbed(levelName, remaining) {
    this.sinceFind = 0;
    this.note(remaining > 0
      ? `he climbed up into ${levelName}; ${remaining} more before daylight`
      : `he climbed into ${levelName}, the last cavern before the surface`);
  }

  openedPassage(total, found) {
    this.sinceFind = 0;
    this.note(`he found a way sealed in the rock and opened it (${found} of ${total})`);
  }

  /**
   * He has opened everything this cavern was hiding, and the way onward has
   * appeared. Worth its own event: it is the only moment the cave gives him
   * something instead of him taking it.
   */
  exhausted(last) {
    this.sinceFind = 0;
    this.note(last
      ? 'he has left nothing here unopened, and the way out of the ground has shown itself'
      : 'he has left nothing in this cavern unopened, and a way further up has opened for him');
  }

  tookEmber(count) {
    this.sinceFind = 0;
    this.note(`he picked up an ember from the floor; he carries ${count} now`);
  }

  foundCache() {
    this.sinceFind = 0;
    this.note('he opened a cache the old miners left behind');
  }

  /** He was near something hidden and moved away without finding it. */
  walkedPast() {
    this.note('his torch went cold near something hidden, and he walked away from it without finding it');
  }

  sawCrystal() { this.note('he passed a seam of pale crystal growing out of the dark'); }

  /**
   * Called every frame; turns raw movement into the few observations worth
   * telling - long fruitless stretches, and retreading old ground.
   */
  update(dt, level, tile, sensing, cavern) {
    const key = `${level}:${tile.tx},${tile.ty}`;
    if (this._lastTile !== key) {
      this._lastTile = key;
      if (this.visited.has(key)) this._revisits++;
      else this.visited.add(key);
      if (this._revisits === 40) this.note('he has begun walking over his own footprints');
      if (this._revisits === 140) this.note('he is going in circles and has not admitted it yet');
    }
    // teased, then left it: only worth saying once in a while
    if (sensing > 0.7) this._teased = 1;
    else if (this._teased === 1 && sensing < 0.15) {
      this._teased = 0;
      if (Math.random() < 0.4) this.walkedPast();
    }
  }

  addWalk(distance) {
    this.walked += distance;
    this.sinceFind += distance;
    if (this.sinceFind > 90) {
      this.sinceFind = 0;
      this.note(`he has walked a long way in the dark and found nothing`);
    }
  }

  summary(level, total, found, embers) {
    return `He is in cavern ${level + 1} of ${total}, has opened ${found} sealed ways, ` +
      `carries ${embers} embers, and has walked roughly ${Math.round(this.walked)} paces.`;
  }
}

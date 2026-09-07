import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Grid } from './game/Grid.js';
import { Cavern } from './game/Cavern.js';
import { Player } from './game/Player.js';
import { Props } from './game/Props.js';
import { Torch } from './game/Torch.js';
import { IsoCamera } from './game/IsoCamera.js';
import { Input } from './game/Input.js';
import { HUD } from './game/HUD.js';
import { Ambience } from './game/Ambience.js';
import { Narrator } from './game/Narrator.js';
import { Bestowal } from './game/Bestowal.js';
import { Minimap } from './game/Minimap.js';
import { generateLevels } from './game/LevelGen.js';
import { Ascension } from './game/Ascension.js';
import { Chronicle } from './game/Chronicle.js';
import {
  updateCutaway,
  setCutawayActive,
  cutawayUniforms,
} from './game/Cutaway.js';

const canvas = document.getElementById('view');
// preserveDrawingBuffer: true here lets tooling read pixels back to measure
// exposure/clipping. It costs performance, so it stays off outside tuning.
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;

const scene = new THREE.Scene();
const hud = new HUD();
const input = new Input(canvas);
const cam = new IsoCamera(innerWidth / innerHeight, { viewSize: 17 });
const clock = new THREE.Clock();
const ambience = new Ambience();
const chronicle = new Chronicle();
const narrator = new Narrator(hud, chronicle);
let bestowal = null;
let minimap = null;
let ascension = null;
const _chest = new THREE.Vector3();

// Browsers refuse to start audio outside a user gesture, so the score waits for
// the player's first input rather than trying (and failing) at load.
const wakeAudio = () => {
  ambience.start().then(() => {
    if (ambience.ready) {
      ambience.setLevel(game.level);
      hud.setMuted(ambience.muted);
    }
  });
  removeEventListener('keydown', wakeAudio);
  removeEventListener('pointerdown', wakeAudio);
};
addEventListener('keydown', wakeAudio);
addEventListener('pointerdown', wakeAudio);
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') hud.setMuted(!ambience.toggle()); // toggle() -> now audible
});

// a barely-there cool ambient: enough to read silhouettes, not enough to explore by
const ambient = new THREE.HemisphereLight(0x25334d, 0x07070c, 0.3);
scene.add(ambient);

// A dim fill on the camera side of the player. His torch is at his own hand,
// so the face turned toward the camera is always backlit and he reads as a
// black cut-out. three.js tests light layers against the CAMERA, not the
// object, so a player-only light is not possible in the forward renderer -
// instead this light is kept very short-range so its pool stays on him.
const fill = new THREE.PointLight(0xffd2a4, 3.6, 3.6, 1.7);
scene.add(fill);
const fillDir = new THREE.Vector3();

const game = {
  level: 0,
  found: 0,
  totalSecrets: 0,
  treasures: 0,
  stairLock: false,
  transition: 0,
  won: false,
  ended: false,
  t: 0,
  blockedHint: '',
};

// ------------------------------------------------------------------ loading
const loader = new GLTFLoader();
const load = (url) =>
  new Promise((res, rej) => loader.load(url, res, undefined, rej));

async function boot() {
  hud.progress(0.08, 'carving the cavern');
  // a different cave every session, generated here rather than shipped
  const doc = generateLevels();
  const grid = new Grid(doc);
  console.log(`[cave] seed ${doc.seed}`);

  hud.progress(0.35, 'setting the stone');
  const cavern = new Cavern(grid);
  console.log(`[cave] ${cavern.tris} triangles built`);

  hud.progress(0.6, 'lighting the torch');
  const boyGltf = await load('models/torchboy.glb');
  hud.progress(0.85, 'scattering the oil');
  const propGltf = await load('models/props.glb');

  const player = new Player(boyGltf, grid);
  const props = new Props(propGltf, grid, cavern);
  const torch = new Torch(scene);

  scene.add(cavern.root, player.root, player.blob, props.group);
  props.selfCheck(grid);
  bestowal = new Bestowal(scene);
  minimap = new Minimap(grid, document.getElementById('minimap'));
  ascension = new Ascension(scene);
  torch.attachTo(player.flame || player.root, player.root);

  game.totalSecrets = cavern.secrets.size;
  enterLevel(0, grid, cavern, props, player, torch, true);

  // The story is written AS he plays, from the chronicle of what he does.
  // Beats are prefetched, so the game never waits on a generation.
  chronicle.wakes(grid.levels[0].name, 'deepest', grid.levels.length);
  narrator.start(chronicle.summary(0, grid.levels.length, 0, 0));

  hud.progress(1, 'ready');
  hud.ready();
  // A reload IS the restart: the caves are generated per run, the story is
  // written per run, and the audio graph is built once at boot - so starting
  // over from scratch is both the correct behaviour and the simplest.
  hud.onRestart(() => window.location.reload());
  hud.toast('Your torch stirs near hidden ways. Climb.', 4.5);

  Object.assign(window, {
    __game: {
      scene,
      renderer,
      cam,
      grid,
      cavern,
      player,
      props,
      torch,
      game,
      ambience,
      narrator,
      chronicle,
      bestow,
      get ascension() {
        return ascension;
      },
      get minimap() {
        return minimap;
      },
      get bestowal() {
        return bestowal;
      },
      cutaway: cutawayUniforms(),
    },
  });
  loop(grid, cavern, props, player, torch);
}

function enterLevel(i, grid, cavern, props, player, torch, snap) {
  game.level = i;
  const lv = grid.levels[i];
  const entry = grid.find(i, i === 0 ? 'P' : '<')[0] || grid.find(i, '.')[0];
  player.placeAt(i, entry.tx, entry.ty);
  cavern.setActiveLevel(i);
  props.setActiveLevel(i);
  // LINEAR fog, not exponential: an ortho camera views the whole scene from a
  // fixed distance, so exponential fog applies one flat tint to everything.
  // Keying near/far to the camera distance turns it back into a depth cue.
  const d = cam.distance;
  const reach = 46 - lv.fog * 380; // denser levels close in sooner
  // fog toward near-black, not toward the ambient tint: a light fog colour
  // silhouettes every distant wall top and the cave starts reading as a
  // mountain range instead of somewhere underground
  const fogCol = new THREE.Color(lv.ambient).multiplyScalar(0.3);
  scene.fog = new THREE.Fog(fogCol, d - 16, d + reach);
  scene.background = fogCol;
  hud.setLevel(lv.name, i, grid.levels.length);
  ambience.setLevel(i);
  if (i > 0) {
    chronicle.climbed(lv.name, grid.levels.length - 1 - i);
    pendingBestow = 0.9; // let the level settle, then bestow
  }
  // per-LEVEL, not the global tally: this number is now the thing standing
  // between him and the way up, so it has to say what he still owes on THIS
  // cavern rather than how far he has got overall
  const c = cavern.countOn(i);
  hud.setFound(c.found, c.total);
  game.stairLock = true;
  pendingUnseal = 0;
  if (snap) cam.follow(player.pos, 0, true);
}

// ------------------------------------------------------------------ loop
function loop(grid, cavern, props, player, torch) {
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    game.t += dt;

    const busy = game.transition > 0 || game.won;

    // sense first: the torch reacts to the distance, the boy to the bearing
    const hidden = cavern.nearestHidden(game.level, player.pos.x, player.pos.z);
    torch.sense(hidden.distance);
    // he only turns his head toward it once the flame is actually stirring
    const lookYaw =
      hidden.yaw !== null && torch.proximity > 0.12
        ? angleDelta(hidden.yaw, player.facing) * torch.proximity
        : null;

    player.update(
      dt,
      busy ? { x: 0, y: 0 } : input.axis(),
      cam.basis(),
      cavern.revealed,
      { proximity: torch.proximity, lookYaw },
    );
    torch.update(dt);
    // pivot before following, so the camera and the movement basis agree this frame
    cam.orbit(input.takeOrbit() + input.orbitRate() * dt);
    cam.follow(player.pos, dt);
    cam.camera.updateMatrixWorld();
    fillDir.copy(cam.offset).normalize();
    fill.position
      .copy(player.pos)
      .addScaledVector(fillDir, 1.25)
      .add(new THREE.Vector3(0, 0.85, 0));
    updateCutaway(cam.camera, player.pos, 0.75); // aim at his torso, not his feet
    // Only dissolve rock when it is genuinely hiding him. Standing beside a
    // wall put geometry nearer the camera than him and used to punch a hole in
    // it for no reason, which read as the torchlight leaking through the rock.
    const camDir = cam.basis().fwd; // points camera -> player
    setCutawayActive(
      grid.viewBlocked(
        game.level,
        player.pos.x,
        player.pos.z,
        -camDir.x,
        -camDir.z,
        Math.tan(cam.elevation),
        player.pos.y + 1.15,
        cavern.revealed,
      ),
      dt,
    );

    const found = cavern.checkReveals(
      game.level,
      player.pos.x,
      player.pos.z,
      torch.revealRadius,
    );
    if (found) {
      game.found += found;
      const c = cavern.countOn(game.level);
      hud.setFound(c.found, c.total);
      chronicle.openedPassage(game.totalSecrets, game.found);
      player.react(1); // brows up, eyes wide, torch jumps
      ambience.discovery();
      bestow(player); // something comes up out of the floor
      // The last passage on a level is what opens the way up. Wait for the
      // knowledge to finish entering him before the stairs rise, so the two
      // read as cause and effect rather than as two things happening at once.
      if (c.complete && props.isSealed(game.level)) {
        hud.toast(
          found > 1 ? `${found} passages open!` : 'The last passage opens...',
        );
        pendingUnseal = 2.4;
      } else {
        const left = c.total - c.found;
        hud.toast(
          `${found > 1 ? `${found} passages open` : 'A passage opens'} — ` +
            `${left} still hidden here`,
        );
      }
    }
    cavern.update(dt);
    props.update(game.t, dt);

    if (!busy) interact(grid, cavern, props, player, torch);

    // the choir hears passages AND uncollected treasure; the flame only ever
    // hears passages, so the hot/cold hunt stays unambiguous
    const wonder = Math.max(
      torch.proximity,
      props.wonder(game.level, player.pos.x, player.pos.z),
    );
    ambience.update(dt, torch.proximity, wonder);
    hud.setSense(torch.proximity, torch.embers);
    hud.hint(
      game.blockedHint ||
        (torch.proximity > 0.72 && !game.won ? 'something gives here' : ''),
    );
    game.blockedHint = ''; // set again next frame if he is still standing there
    // a descent queues one, so it lands after the fade rather than under it
    if (pendingBestow > 0) {
      pendingBestow -= dt;
      if (pendingBestow <= 0) bestow(player);
    }
    if (pendingUnseal > 0) {
      pendingUnseal -= dt;
      if (pendingUnseal <= 0) openTheWayOn(grid, props, player);
    }
    // ---- the ending takes over completely, and does not give control back.
    // The `|| game.ended` matters: without it the normal loop resumes the frame
    // after the ascension completes and its own hud.fade(0) wipes the whiteout.
    if (ascension && (ascension.active || game.ended)) {
      const { whiteout, finished } = ascension.update(dt, player);
      hud.whiteout(game.ended ? 1 : whiteout);
      if (!game.ended) {
        player.mixer.update(dt);
        cam.follow(player.pos, dt);
        cam.camera.updateMatrixWorld();
      }
      if (finished && !game.ended) {
        game.ended = true;
        hud.enterEnding();
        narrator.finish();
      }
      hud.update(dt);
      renderer.render(scene, cam.camera);
      return;
    }

    if (bestowal) {
      _chest.set(player.pos.x, player.pos.y + 0.78, player.pos.z);
      if (bestowal.update(dt, _chest)) {
        // the instant it goes in: he reacts, and the dark tells him something
        player.react(1);
        const known = narrator.nextRevelation();
        if (known) hud.revelation(known);
      }
    }
    if (minimap)
      minimap.update(dt, game.level, player.pos, player.facing, cavern, props);
    chronicle.update(
      dt,
      game.level,
      grid.worldToTile(player.pos.x, player.pos.z),
      torch.proximity,
      cavern,
    );
    narrator.update(
      dt,
      player.pos,
      busy,
      chronicle.summary(
        game.level,
        grid.levels.length,
        game.found,
        torch.embers,
      ),
    );
    hud.update(dt);
    if (game.transition > 0) {
      game.transition = Math.max(0, game.transition - dt);
      hud.fade(Math.min(1, game.transition * 2.2));
    } else hud.fade(0);

    renderer.render(scene, cam.camera);
  });
}

function interact(grid, cavern, props, player, torch) {
  const { x, z } = player.pos;

  const item = props.nearest(game.level, x, z, 1.05);
  if (item) {
    if (item.spec.kind === 'ember') {
      props.take(item);
      torch.addEmber();
      player.playOnce('Gather');
      player.react(0.55);
      ambience.pickup();
      chronicle.tookEmber(torch.embers);
      hud.toast(
        `Ember taken - you can feel further now (${torch.revealRadius.toFixed(1)}m)`,
      );
    } else if (item.spec.kind === 'treasure') {
      props.take(item);
      game.treasures++;
      player.react(0.9);
      narrator.reveal();
      ambience.discovery();
      hud.toast('A cache of the old miners!');
    }
  }

  // --- the way out (final level)
  // props.nearest only returns what is visible, so a sealed way out cannot be
  // walked into - but be explicit, because this one ends the game
  const exit = props.nearest(game.level, x, z, 2.2);
  if (
    exit &&
    exit.spec.kind === 'exit' &&
    !game.won &&
    !props.isSealed(game.level)
  ) {
    game.won = true;
    hud.toast('', 0.01);
    ascension.start(player, exit.mesh.position);
    return;
  }

  // --- the way up. '>' is walkable now (a staircase, not a shaft), so he can
  // stand on it and the trigger is simply "close enough".
  const down = grid.find(game.level, '>')[0];
  if (down) {
    const w = grid.tileToWorld(game.level, down.tx, down.ty);
    const near = Math.hypot(w.x - x, w.z - z) < 1.5;
    if (near && props.isSealed(game.level)) {
      const c = cavern.countOn(game.level);
      const n = c.total - c.found;
      // stash rather than set: the loop writes hud.hint after interact() runs
      game.blockedHint = `the way is shut — ${n} passage${n === 1 ? '' : 's'} still hidden here`;
    }
    if (
      near &&
      !game.stairLock &&
      !props.isSealed(game.level) &&
      game.level + 1 < grid.levels.length
    ) {
      game.transition = 0.55;
      setTimeout(
        () =>
          enterLevel(game.level + 1, grid, cavern, props, player, torch, true),
        260,
      );
      return;
    }
    if (!near) game.stairLock = false;
  } else {
    game.stairLock = false;
  }
}

/**
 * The bestowal: light out of the floor, into him, and a piece of knowledge he
 * has no business having. Deliberately NOT a story beat - the beats are his
 * memory, this is something handed to him from outside.
 */
function bestow(player) {
  if (!bestowal) return;
  // spawn it on the camera side of him so his own body does not hide the rise
  const f = cam.basis().fwd;
  bestowal.fire(player.pos, { x: -f.x, z: -f.z });
  ambience.bestow();
}
let pendingBestow = 0;
let pendingUnseal = 0;

/**
 * Every passage on this level is open, so the way onward comes out of the
 * floor. Deliberately a separate moment from the bestowal that precedes it:
 * the knowledge is what he gets for looking, and this is what it buys him.
 */
function openTheWayOn(grid, props, player) {
  const it = props.unseal(game.level);
  if (!it) return;
  const last = game.level + 1 >= grid.levels.length;
  hud.toast(
    last
      ? 'Nothing is hidden here now. The way out stands open.'
      : 'Nothing is hidden here now. A way up opens.',
    5,
  );
  ambience.discovery();
  player.react(1);
  chronicle.exhausted(last); // the story should know he finished a cavern
  narrator.reveal();
  if (minimap) minimap.dirty = true; // the marker was being withheld
}

/** Shortest signed angle from b to a, in (-PI, PI]. */
function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  cam.resize(innerWidth / innerHeight);
});

boot().catch((e) => {
  console.error(e);
  document.getElementById('loading').innerHTML =
    `<div class="err"><b>Failed to start</b><br><code>${e.message}</code></div>`;
});

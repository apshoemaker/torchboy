# Rendering

A dark cave lit by a light the character carries, viewed through an orthographic
camera. Almost every constraint here follows from one of those three facts.

Files: `src/game/Torch.js`, `src/game/Cutaway.js`, `src/game/IsoCamera.js`,
`src/game/CavernMesh.js`, `src/game/Player.js`.

## The carried light

**A light carried by the character cannot use physical falloff.** The torch rides
on his hand ~1 unit from his body but has to light a room 6–10 units across.
True inverse-square is a **36:1 ratio** over that span, so any intensity that lit
the room compressed his torch-side into flat white, with the ACES shoulder
reading as a hard edge across his face. Fixed with a sub-physical decay (1.25)
*plus* pushing the light out past the flame, away from his body, while the
visible flame stays on the torch tip.

**The torch light has `distance = 0`.** A non-zero cutoff makes three.js window
the falloff to zero at that radius, drawing a hard-edged disc of light on the
floor. Pure inverse-square has no edge. The halo sprite is also capped small:
wide enough to reach the ground, it gets sliced by the floor into a hard line.

**The warm-to-cold ramp is lerped in RGB, not swept in hue.** A hue sweep from
amber to cyan travels through green, and a cave lit by green torchlight looks
sickly rather than eerie.

**The player neither casts nor receives the torch's shadow.** The light is on his
own hand: shadows he casts are projected enormous and blot out the room, and at
that range his head straddles several faces of the point light's shadow cube map.
A contact shadow grounds him instead.

**three.js tests light layers against the camera, not the object**, so a
player-only fill light is impossible in the forward renderer. The fill is instead
kept very short-range so its pool stays on him.

## The orthographic camera

**Fog must be linear, not exponential.** An orthographic camera views the whole
scene from a fixed distance, so `FogExp2` applies one flat tint to everything —
at density 0.055 and 60 units back, the entire cave rendered as solid fog. Fog
near/far are keyed to the camera distance instead, which turns it back into a
depth cue.

Fog colour tends toward near-black rather than the ambient tint. A light fog
colour silhouettes every distant wall top and the cave starts reading as a
mountain range.

**Movement is screen-relative.** `IsoCamera.basis()` derives the movement axes
from the camera offset, so rotating the view rotates the controls with it and
"up" is always up-screen. Anything that walks the player must go through this
basis, or it will disagree with the camera the moment the player pivots.

## Wall cutaway

Three-unit walls hide the character constantly. Rock between camera and player is
dissolved with a **dithered discard** rather than alpha blending, so there is no
transparency sorting to go wrong on a big merged mesh. Applied to **walls only** —
on the floor it punches a hole in the ground the player is standing on.

**It fires on occlusion, not proximity.** The first version dissolved whenever
the player was near a wall, which read as the torch shining *through* rock.
`Grid.viewBlocked()` marches the grid along the sight line instead — ~20 tile
lookups rather than ~12k triangle tests.

## Mesh construction

Rock and floor are built on a lattice **2× finer than the tile grid**, with
corner XY wander that *varies with height*, so walls lean and bulge instead of
extruding as clean prisms. Rubble scattered along the floor/wall seam does more
for the illusion than extra wall detail — breaking that clean line is the point.

**The floor must be smooth-shaded and the rock flat-shaded.** Flat-shading a
gently rolling surface on a regular lattice turns every cell into its own facet
and the ground reads as a diamond quilt — *more* geometric than the flat plane it
replaced.

## Loading assets

**glTF splits multi-material objects into primitives**, which `GLTFLoader`
rebuilds as a `Group`, not a `Mesh`. An `isMesh` filter silently dropped every
ember, every treasure and the exit archway. Look prototypes up **by name**.

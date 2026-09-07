# 0008. Linear fog, keyed to camera distance

**Status:** Accepted

## Context

The game uses an orthographic camera, which views the whole scene from a fixed
distance. `FogExp2` computes density from distance to the camera — but under an
orthographic projection that distance barely varies across the scene, so
exponential fog applies one flat tint to everything. At density 0.055 and 60
units back, the entire cave rendered as solid fog.

## Decision

Use linear `THREE.Fog` with near and far derived from the camera distance, so fog
maps onto the visible depth range and works as a depth cue again.

Fog colour tends toward near-black rather than the ambient tint.

## Consequences

- Fog has to be recomputed whenever camera distance changes, rather than being
  set once.
- The near-black colour is deliberate: a lighter fog colour silhouettes every
  distant wall top and the cave starts reading as a mountain range rather than as
  somewhere underground.
- This generalises — **an orthographic camera invalidates several
  distance-based effects**, not only fog. Check any effect that assumes a
  perspective frustum.

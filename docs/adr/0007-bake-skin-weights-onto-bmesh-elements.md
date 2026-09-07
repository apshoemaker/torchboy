# 0007. Store bmesh assignment on elements, never in side tables

**Status:** Accepted

## Context

The character was reported as "not animated at all". The clips existed, the bones
moved, and nothing on screen budged.

The cause was in the Blender build. `Part.bake` collected `BMVert`/`BMFace`
references — and later indices — into side tables, then applied bone weights and
materials from those tables at the end. But bmesh reallocates its element arrays
as the mesh grows, invalidating earlier references; and indices are no better,
because bevel's deletions free slots that later geometry reuses and
`index_update()` renumbers them.

The result: **1750 of 1792 vertices had no vertex group**, so the whole mesh bound
to glTF's `neutral_bone` and could not deform.

## Decision

Assignment lives **on the elements themselves**: a bmesh deform layer for vertex
weights, `BMFace.material_index` for materials. Nothing about an element is
remembered outside that element.

## Consequences

- The build is correct by construction rather than by careful bookkeeping.
- Two diagnostic dead ends are worth remembering, because both looked like
  evidence: reading quaternion component spread as motion (it varies without the
  mesh moving), and measuring bone *pivot* positions (which do not move when that
  bone rotates). Neither would have found this. Counting vertices with no vertex
  group found it immediately.
- General rule for this codebase: **a mesh that looks right in Blender can still
  be silently broken in the game.** Verify the exported rig, not the viewport.

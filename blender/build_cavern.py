"""Builds the cavern geometry from data/levels.json and exports cavern.glb.

The grid in levels.json is the single source of truth: this script turns it
into meshes, and src/game/Level.js turns the SAME file into collision. Nothing
about the layout is authored twice.

Key ideas:
  * a shared CORNER LATTICE gives every tile corner one jittered height, so
    neighbouring wall tops and floor tiles seam perfectly instead of stepping.
  * only rock tiles NEAR floor are built - the solid interior of the map is
    never seen and would be tens of thousands of wasted triangles.
  * each secret wall is its own object (`L0_secret_12_7`) so the game can fade
    one individually, but it shares the lattice and material with ordinary
    rock, so it is genuinely indistinguishable until revealed.

Axis mapping (documented because the browser side must match exactly):
    tile (tx, ty)  ->  Blender (  (tx - W/2)*TS,  -(ty - H/2)*TS,  -level*DROP )
    glTF Y-up flip ->  three.js (  x,  y_blender_z,  -y_blender  )
    so in three.js:   x = (tx - W/2)*TS,   z = (ty - H/2)*TS
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_build as L
import importlib; importlib.reload(L)

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DOC = json.load(open(os.path.join(ROOT, "public", "data", "levels.json")))

TS      = DOC["tileSize"]
WALL_H  = DOC["wallHeight"]
DROP    = DOC["levelDrop"]
W, H    = DOC["width"], DOC["height"]
FLOOR_D = 0.75                  # floor slab thickness
# Both surfaces are built on a lattice SUB times finer than the tile grid.
# One vertex per tile makes unmistakably geometric, tiled-looking rock; at 2x
# the silhouette breaks up enough to read as carved stone.
# FLOOR_SUB is mirrored in src/game/Grid.js and MUST stay in sync - the player
# stands on the surface this function defines.
FLOOR_SUB = 2
WALL_SUB = 2
SOLID   = set("#S ")
WALKABLE = set(".PFT*<>X")


def hsh(x, y, salt=0):
    """Deterministic 0..1 hash - identical geometry on every rebuild."""
    n = (x * 374761393 + y * 668265263 + salt * 2654435761) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFFFF) / 0xFFFFFFFF


def corner(cx, cy):
    return ((cx - W / 2) * TS, -(cy - H / 2) * TS)


def tile_centre(tx, ty):
    return ((tx - W / 2 + 0.5) * TS, -(ty - H / 2 + 0.5) * TS)


class Grid:
    def __init__(self, rows):
        self.rows = rows
        self.h, self.w = len(rows), len(rows[0])

    def at(self, x, y):
        if x < 0 or y < 0 or x >= self.w or y >= self.h:
            return '#'
        return self.rows[y][x]

    def walkable(self, x, y):
        return self.at(x, y) in WALKABLE

    def solid(self, x, y):
        return self.at(x, y) in SOLID

    def find(self, ch):
        return [(x, y) for y in range(self.h) for x in range(self.w)
                if self.rows[y][x] == ch]


# ---------------------------------------------------------------- lattice
def floor_z(cx, cy):
    """Floor height at a FLOOR_SUB-lattice corner. Ported verbatim to JS."""
    x, y = cx / FLOOR_SUB, cy / FLOOR_SUB
    return (hsh(cx, cy, 11) - 0.5) * 0.15 \
        + math.sin(x * 0.62) * 0.125 + math.cos(y * 0.51) * 0.125 \
        + math.sin((x + y) * 1.17) * 0.085 \
        + math.cos((x - y * 1.4) * 0.83) * 0.07


def floor_at(tx, ty):
    """Floor height at a tile centre. With FLOOR_SUB=2 the centre lands exactly
    on a lattice corner, so props sit on the surface with no interpolation."""
    return floor_z(tx * FLOOR_SUB + FLOOR_SUB // 2, ty * FLOOR_SUB + FLOOR_SUB // 2)


def wall_z(cx, cy):
    """Ragged rock tops on the WALL_SUB lattice. Layered octaves rather than one
    hash: a single frequency reads as evenly-spiked noise, not as rock."""
    x, y = cx / WALL_SUB, cy / WALL_SUB
    # the per-vertex hash is kept the SMALLEST term on purpose: let it lead and
    # the wall tops become a field of shards, which is not what rock looks like.
    # The low-frequency waves do the shaping; the hash only roughens.
    return WALL_H + (hsh(cx, cy, 29) - 0.5) * 0.62 \
        + math.sin(x * 0.55 + y * 0.33) * 0.62 \
        + math.cos(x * 1.13 - y * 0.87) * 0.34 \
        + math.sin((x + y) * 2.1) * 0.11


def quad(bm, p):
    vs = [bm.verts.new(v) for v in p]
    return bm.faces.new(vs)


def build_slab(bm, tiles, top_fn, bottom_z, inset=0.0, sub=1, mid=False):
    """Closed volume over a tile set: jittered top, flat bottom, skirt sides.

    Sides are emitted only on the region boundary, which keeps the mesh manifold
    so recalc_face_normals can fix winding instead of us hand-reasoning it.

    `sub` subdivides each tile into sub x sub cells before building, which is
    what turns blocky per-tile prisms into something carved-looking.

    `inset` displaces corners in XY by an amount that VARIES WITH HEIGHT, so a
    wall leans and bulges up its face rather than extruding as a clean prism.
    `mid` adds a waist ring of vertices for that lean to happen at.
    """
    cells = set()
    for (tx, ty) in tiles:
        for j in range(sub):
            for i in range(sub):
                cells.add((tx * sub + i, ty * sub + j))

    vcache = {}
    # band 0 = base, 1 = waist, 2 = crown; each gets its own XY wander
    BAND_AMT = (0.20, 0.95, 1.0)

    def V(cx, cy, z, band):
        key = (cx, cy, band)
        if key not in vcache:
            x = (cx / sub - W / 2) * TS
            y = -(cy / sub - H / 2) * TS
            if inset:
                amt = inset * BAND_AMT[band] / sub
                x += (0.5 - hsh(cx, cy, 77 + band * 13)) * amt
                y += (0.5 - hsh(cx, cy, 91 + band * 13)) * amt
            vcache[key] = bm.verts.new((x, y, z))
        return vcache[key]

    def crown(c): return V(c[0], c[1], top_fn(c[0], c[1]), 2)
    def waist(c):
        t = top_fn(c[0], c[1])
        return V(c[0], c[1], bottom_z + (t - bottom_z) * 0.52, 1)
    def base(c): return V(c[0], c[1], bottom_z, 0)

    faces = []
    for (cx, cy) in cells:
        c = [(cx, cy), (cx + 1, cy), (cx + 1, cy + 1), (cx, cy + 1)]
        faces.append(bm.faces.new([crown(k) for k in c]))
        faces.append(bm.faces.new([base(k) for k in c]))
        for i, (dx, dy) in enumerate(((0, -1), (1, 0), (0, 1), (-1, 0))):
            if (cx + dx, cy + dy) in cells:
                continue
            a, b = c[i], c[(i + 1) % 4]
            if mid:
                faces.append(bm.faces.new([crown(a), crown(b), waist(b), waist(a)]))
                faces.append(bm.faces.new([waist(a), waist(b), base(b), base(a)]))
            else:
                faces.append(bm.faces.new([crown(a), crown(b), base(b), base(a)]))
    return faces


def finish(bm, name, col, mat, smooth=False):
    """`smooth` matters more than it looks.

    The floor is a gently rolling surface on a perfectly regular lattice, so
    flat-shading it turns every cell into its own facet and the ground reads as
    a diamond quilt - far MORE geometric than the flat plane it replaced. It
    needs smooth normals. Rock is the opposite: faceted is exactly right.
    """
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob


# ---------------------------------------------------------------- decoration
def add_stalagmites(bm, g, level):
    n = 0
    for y in range(g.h):
        for x in range(g.w):
            if g.at(x, y) != '.':
                continue
            if hsh(x, y, 300 + level) > 0.055:
                continue
            # skip tiles in a doorway - a spike in a corridor is just annoying
            openn = sum(g.walkable(x + dx, y + dy)
                        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if openn < 3:
                continue
            cx, cy = tile_centre(x, y)
            hgt = 0.5 + hsh(x, y, 41) * 1.1
            r = 0.16 + hsh(x, y, 43) * 0.16
            off = (hsh(x, y, 45) - 0.5) * TS * 0.4
            L.bm_cone(bm, r, r * 0.08, hgt,
                      (cx + off, cy - off, floor_at(x, y) + hgt / 2 - 0.05),
                      segments=6)
            n += 1
    return n


def add_boulders(bm, g, level):
    """Rounded rubble piled where the floor meets rock.

    A perfectly clean floor/wall seam is what makes a tile-built cave read as
    architecture. Breaking that line does more for the illusion than any amount
    of extra detail on the walls themselves.
    """
    n = 0
    for y in range(g.h):
        for x in range(g.w):
            if g.at(x, y) != '.':
                continue
            touching = sum(g.solid(x + dx, y + dy)
                           for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                                          (1, 1), (-1, -1), (1, -1), (-1, 1)))
            if not touching or hsh(x, y, 500 + level) > 0.30:
                continue
            cx, cy = tile_centre(x, y)
            base = floor_at(x, y)
            for k in range(1 + int(hsh(x, y, 510) * 2)):
                r = 0.20 + hsh(x, y, 520 + k) * 0.36
                ax = (hsh(x, y, 530 + k) - 0.5) * TS * 0.75
                ay = (hsh(x, y, 540 + k) - 0.5) * TS * 0.75
                verts = L.bm_sphere(bm, r, (cx + ax, cy + ay, base + r * 0.42),
                                    subdiv=1,
                                    scale=(1.0 + hsh(x, y, 550 + k) * 0.5,
                                           1.0 + hsh(x, y, 560 + k) * 0.5, 0.62))
                bmesh.ops.rotate(bm, verts=verts,
                                 cent=(cx + ax, cy + ay, base + r * 0.42),
                                 matrix=Euler((0, 0, hsh(x, y, 570 + k) * 3.14),
                                              'XYZ').to_matrix())
                n += 1
    return n


def add_crystals(bm, g, level):
    pts = []
    for (x, y) in g.find('*'):
        cx, cy = tile_centre(x, y)
        base = floor_at(x, y)
        for k in range(3):
            a = hsh(x, y, 50 + k) * math.tau
            d = 0.18 + hsh(x, y, 60 + k) * 0.42
            hgt = 0.38 + hsh(x, y, 70 + k) * 0.55
            r = 0.075 + hsh(x, y, 80 + k) * 0.06
            px, py = cx + math.cos(a) * d, cy + math.sin(a) * d
            L.bm_cone(bm, r, 0.012, hgt, (px, py, base + hgt / 2), segments=5,
                      rot=((hsh(x, y, 90 + k) - 0.5) * 0.5,
                           (hsh(x, y, 95 + k) - 0.5) * 0.5, 0))
        pts.append((x, y))
    return pts


# ---------------------------------------------------------------- main build
def build():
    col = L.purge("Cavern")
    rock = L.material("cav_rock", (0.088, 0.082, 0.094), 0.96)
    floor_m = L.material("cav_floor", (0.135, 0.115, 0.105), 0.93)
    crystal_m = L.material("cav_crystal", (0.22, 0.55, 0.72), 0.25,
                           emission=(0.30, 0.72, 0.95), emission_strength=3.0)
    stats = []

    for lv in DOC["levels"]:
        i = lv["index"]
        g = Grid(lv["grid"])
        zoff = -i * DROP

        floors = [(x, y) for y in range(g.h) for x in range(g.w) if g.walkable(x, y)]
        # the stairs-down tile is left UNFLOORED: the hole is what lets you see
        # the level below, which is the whole point of stacking them. The game
        # treats '>' as solid, so the player steps up to the shaft, not into it.
        slab = [t for t in floors if g.at(*t) != '>']
        # rock is only built where it can be seen: within 2 tiles of floor
        near = set()
        for (x, y) in floors:
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    if g.solid(x + dx, y + dy):
                        near.add((x + dx, y + dy))
        secrets = set(g.find('S'))
        walls = sorted(near - secrets)

        bm = bmesh.new()
        build_slab(bm, slab, floor_z, -FLOOR_D, sub=FLOOR_SUB)
        fob = finish(bm, f"L{i}_floor", col, floor_m, smooth=True)

        bm = bmesh.new()
        build_slab(bm, walls, wall_z, -FLOOR_D, inset=0.62, sub=WALL_SUB, mid=True)
        wob = finish(bm, f"L{i}_rock", col, rock)

        # each secret is its own object, but shares lattice + material with rock
        sobs = []
        for (x, y) in sorted(secrets):
            bm = bmesh.new()
            build_slab(bm, [(x, y)], wall_z, -FLOOR_D, inset=0.62, sub=WALL_SUB, mid=True)
            sobs.append(finish(bm, f"L{i}_secret_{x}_{y}", col, rock))

        bm = bmesh.new()
        nspikes = add_stalagmites(bm, g, i)
        nrocks = add_boulders(bm, g, i)
        dob = finish(bm, f"L{i}_deco", col, rock) if (nspikes or nrocks) else None

        bm = bmesh.new()
        cpts = add_crystals(bm, g, i)
        cob = finish(bm, f"L{i}_crystal", col, crystal_m) if cpts else None

        parent = bpy.data.objects.new(f"Level_{i}", None)
        col.objects.link(parent)
        parent.location = (0, 0, zoff)
        for ob in [fob, wob, dob, cob] + sobs:
            if ob:
                ob.parent = parent

        stats.append({
            "level": i, "name": lv["name"], "floors": len(floors),
            "walls": len(walls), "secrets": len(secrets),
            "spikes": nspikes, "boulders": nrocks, "crystals": len(cpts),
            "tris": sum(len(o.data.polygons) for o in [fob, wob, dob, cob] + sobs if o),
        })
    return col, stats


def export(col):
    out = os.path.join(ROOT, "public", "models")
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, "cavern.glb")
    bpy.ops.object.select_all(action='DESELECT')
    for ob in col.objects:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_animations=False,
        export_materials='EXPORT', export_cameras=False, export_lights=False,
        export_normals=True,
    )
    return path, os.path.getsize(path)


col, stats = build()
path, size = export(col)
result = {"levels": stats, "glb": path, "kb": round(size / 1024)}

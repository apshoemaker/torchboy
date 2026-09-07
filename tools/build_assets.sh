#!/usr/bin/env bash
# Rebuild every .glb from the Blender sources, headless.
#
# The same scripts also run inside a live Blender session over MCP (handy for
# eyeballing a model while iterating), but this path is the reproducible one:
# no GUI, no open file, no leftover scene state.
set -euo pipefail
cd "$(dirname "$0")/.."

BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
[ -x "$BLENDER" ] || { echo "Blender not found at $BLENDER (set \$BLENDER)"; exit 1; }

# The cavern is no longer an exported mesh - it is generated in the browser
# (src/game/LevelGen.js -> src/game/CavernMesh.js), so only the character and
# the props are built here. See docs/adr/0001-generate-caves-in-the-browser.md.
for script in build_character build_props; do
  echo "--- $script"
  "$BLENDER" --background --factory-startup \
    --python "blender/$script.py" 2>&1 \
    | grep -viE "^(Blender|Read blend|found bundled|INFO: (Starting|Extracting|Primitives|Finished))" \
    | grep -vE "^\s*$" || true
done

ls -lh public/models/*.glb

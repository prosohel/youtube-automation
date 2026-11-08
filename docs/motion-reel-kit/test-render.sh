#!/bin/sh
# Smoke test: scaffold a film with the blank preset, make 5 seconds of music + SFX, and render it.
#   npm test        (or: sh test-render.sh [preset-dir] [seconds])
# Output: videos/_test-<time>/renders/16x9.mp4
set -e
cd "$(dirname "$0")"
PRESET="${1:-presets/blank}"
SECS="${2:-5}"
SLUG="videos/_test-$(date +%Y%m%d-%H%M%S)"
SKILL=.claude/skills/motion-reel

sh "$SKILL/scripts/init.sh" "$SLUG" --preset "$PRESET"
cd "$SLUG"
# shorten the starter timeline to the test length
node -e "const f='timeline.json',fs=require('fs'),t=JSON.parse(fs.readFileSync(f));t.duration=+process.argv[1];t.formats=[t.formats[0]];fs.writeFileSync(f,JSON.stringify(t,null,2))" "$SECS"

if python3 -c "import numpy, scipy, soundfile, librosa" 2>/dev/null; then
  python3 scripts/music.py
  python3 scripts/beats.py audio/music.wav --stem audio/drums.wav
  node scripts/sync.mjs >/dev/null
  node scripts/sfx.mjs
  python3 scripts/mix.py
else
  echo "WARN: python deps missing (pip install -r requirements.txt) → rendering without sound"
  node scripts/sync.mjs >/dev/null
fi
node scripts/render.mjs
OUT="$SLUG/renders/$(node -p "require('./timeline.json').formats[0]").mp4"
echo "OK: $OUT"

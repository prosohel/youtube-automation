#!/bin/sh
# Motion Reel Kit installer. Makes /motion-reel available in EVERY Claude Code project.
#
#   sh install.sh                    install for your user (~/.claude/skills/motion-reel)
#   sh install.sh --project <dir>    install into one project only (<dir>/.claude/skills/motion-reel)
#
# It copies the skill + presets, installs Playwright + Chromium next to the skill, and installs the Python audio
# libraries. Safe to re-run: an existing install is moved to a backup first.
set -e
KIT="$(cd "$(dirname "$0")" && pwd)"
if [ "$1" = "--project" ]; then
  [ -d "$2" ] || { echo "no such folder: $2"; exit 1; }
  BASE="$(cd "$2" && pwd)/.claude"
else
  BASE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
fi
DEST="$BASE/skills/motion-reel"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok() { printf '  ✓ %s\n' "$1"; }
warn() { printf '  ! %s\n' "$1"; }

say "1/4  Checking tools"
command -v node >/dev/null || { echo "Node is missing. Install Node 22+ (macOS: brew install node) and re-run."; exit 1; }
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] && ok "node $(node -v)" || warn "node $(node -v) is old; Node 22+ is recommended"
command -v ffmpeg >/dev/null && ok "ffmpeg" || { echo "ffmpeg is missing. Install it (macOS: brew install ffmpeg) and re-run."; exit 1; }
command -v python3 >/dev/null && ok "python3 $(python3 -c 'import sys;print(sys.version.split()[0])')" || { echo "python3 is missing. Install Python 3.9+ and re-run."; exit 1; }

say "2/4  Installing the skill → $DEST"
mkdir -p "$BASE/skills"
if [ -d "$DEST" ]; then
  BK="$DEST.bak-$(date +%Y%m%d-%H%M%S)"; mv "$DEST" "$BK"; ok "previous install moved to $BK"
fi
cp -R "$KIT/.claude/skills/motion-reel" "$DEST"
cp -R "$KIT/presets" "$DEST/presets"
cp "$KIT/package.json" "$DEST/package.json"
ok "skill, engine, scripts, templates and presets copied"

say "3/4  Installing Playwright + Chromium (for rendering)"
(cd "$DEST" && npm install --silent --no-audit --no-fund >/dev/null && npx --yes playwright install chromium >/dev/null) \
  && ok "playwright + chromium ready" || { echo "npm install failed in $DEST"; exit 1; }

say "4/4  Installing Python audio libraries (numpy, scipy, soundfile, librosa, pillow)"
if python3 -c "import numpy, scipy, soundfile, librosa, PIL" 2>/dev/null; then
  ok "already installed"
elif python3 -m pip install --user -q -r "$KIT/requirements.txt" 2>/dev/null || python3 -m pip install -q -r "$KIT/requirements.txt" 2>/dev/null; then
  ok "installed"
else
  warn "pip refused to install them (common with Homebrew Python). Music, beat grid and mix need them."
  echo "    Fix: see 'Troubleshooting' in $KIT/README.md, then re-run this installer."
fi

say "Done."
echo "  Start a NEW Claude Code session (skills load when a session starts), open any project, and type:"
echo
echo "    /motion-reel a 15-second launch reel for https://yoursite.com"
echo
[ "$1" = "--project" ] || echo "  Tip: copy CLAUDE.md from this kit into a project root to make the motion rules apply to everything there."

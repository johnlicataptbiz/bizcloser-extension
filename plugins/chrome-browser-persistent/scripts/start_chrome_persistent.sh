#!/usr/bin/env bash
set -euo pipefail

PORT="${CHROME_DEBUG_PORT:-9222}"
PROFILE_DIR="${CHROME_PERSISTENT_PROFILE:-$HOME/.codex/chrome-persistent-profile}"
START_URL="${1:-about:blank}"

mkdir -p "$PROFILE_DIR"

if command -v open >/dev/null 2>&1; then
  # macOS
  open -na "Google Chrome" --args \
    --remote-debugging-port="$PORT" \
    --user-data-dir="$PROFILE_DIR" \
    --new-window "$START_URL"
elif command -v google-chrome >/dev/null 2>&1; then
  # Linux
  nohup google-chrome \
    --remote-debugging-port="$PORT" \
    --user-data-dir="$PROFILE_DIR" \
    --new-window "$START_URL" >/dev/null 2>&1 &
elif command -v chrome >/dev/null 2>&1; then
  nohup chrome \
    --remote-debugging-port="$PORT" \
    --user-data-dir="$PROFILE_DIR" \
    --new-window "$START_URL" >/dev/null 2>&1 &
else
  echo "Could not find Chrome launcher (open/google-chrome/chrome)." >&2
  exit 1
fi

echo "Started persistent Chrome."
echo "CDP endpoint: http://127.0.0.1:${PORT}"
echo "Profile dir: ${PROFILE_DIR}"

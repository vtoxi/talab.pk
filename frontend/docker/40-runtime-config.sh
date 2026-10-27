#!/bin/sh
# Runs when the container starts (nginx image runs /docker-entrypoint.d/*.sh).
# Writes /config.json from environment variables, so ONE image works in every environment.
# API_URL is empty when the API is served from the same site (nginx proxies /api and /hubs).
# Note: defaults are set with plain assignments because "${VAR:-default}" stops at the first "}" (map URLs contain {z}).
set -eu

esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

OUT="${CONFIG_OUT:-/usr/share/nginx/html/config.json}"

API_URL="${API_URL:-}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
[ -n "${TILE_URL:-}" ] || TILE_URL='https://tile.openstreetmap.org/{z}/{x}/{y}.png'
[ -n "${TILE_ATTRIBUTION:-}" ] || TILE_ATTRIBUTION='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
[ -n "${TILE_MAX_ZOOM:-}" ] || TILE_MAX_ZOOM=19

case "$TILE_MAX_ZOOM" in ''|*[!0-9]*) echo "ERROR: TILE_MAX_ZOOM must be a number, got '$TILE_MAX_ZOOM'" >&2; exit 1;; esac
case "$TILE_URL" in *tile.openstreetmap.org*) echo "WARNING: TILE_URL is the public OpenStreetMap server. Its usage policy does not allow heavy or commercial use. Set TILE_URL to a tile provider or your own server." >&2;; esac
[ -n "$GOOGLE_CLIENT_ID" ] || echo "WARNING: GOOGLE_CLIENT_ID is empty, so people cannot sign in." >&2

cat > "$OUT" <<EOF
{
  "apiUrl": "$(esc "$API_URL")",
  "googleClientId": "$(esc "$GOOGLE_CLIENT_ID")",
  "tileUrl": "$(esc "$TILE_URL")",
  "tileAttribution": "$(esc "$TILE_ATTRIBUTION")",
  "tileMaxZoom": $TILE_MAX_ZOOM
}
EOF
echo "runtime config written (tiles: $TILE_URL)"

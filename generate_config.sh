#!/bin/bash
# generate_config.sh
# Reads config.lua via Lua and writes config.json.
# Called once on server startup AND on POST /api/config/reload (no restart needed).

set -euo pipefail

# Verify lua is available
if ! command -v lua &>/dev/null; then
  echo "ERROR: lua interpreter not found. Install lua (e.g. apt install lua5.4)" >&2
  exit 1
fi

# Verify config.lua exists
if [ ! -f config.lua ]; then
  echo "ERROR: config.lua not found in $(pwd)" >&2
  exit 1
fi

ALBUM_TYPE=$(lua -e "local c = dofile('config.lua'); print(c.album_type)")
MIN_RELEASE_YEAR=$(lua -e "local c = dofile('config.lua'); print(c.min_release_year)")
MAX_RESULTS=$(lua -e "local c = dofile('config.lua'); print(c.max_results)")

# Validate values before writing
if [[ -z "$ALBUM_TYPE" || -z "$MIN_RELEASE_YEAR" || -z "$MAX_RESULTS" ]]; then
  echo "ERROR: config.lua returned empty values — check the file" >&2
  exit 1
fi

cat > config.json << EOF
{
  "albumType": "$ALBUM_TYPE",
  "minReleaseYear": $MIN_RELEASE_YEAR,
  "maxResults": $MAX_RESULTS
}
EOF

echo "Config generated: albumType=$ALBUM_TYPE, minReleaseYear=$MIN_RELEASE_YEAR, maxResults=$MAX_RESULTS"
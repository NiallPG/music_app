#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMMAND=${1:-help}

cd "$ROOT_DIR"

need_bin() {
  if [ ! -x "node_modules/.bin/$1" ]; then
    printf '%s\n' "Missing node_modules/.bin/$1."
    printf '%s\n' "Run npm install, then try this workflow command again."
    exit 1
  fi
}

case "$COMMAND" in
  validate)
    need_bin tsc
    need_bin vite
    node scripts/validate-lua-rules.mjs
    npm run build
    ;;
  ui)
    need_bin vite
    npm run dev
    ;;
  api)
    node server.js
    ;;
  dev)
    need_bin vite
    node server.js &
    API_PID=$!

    cleanup() {
      kill "$API_PID" 2>/dev/null || true
    }

    trap cleanup INT TERM EXIT
    npm run workflow:ui
    ;;
  help|*)
    printf '%s\n' "Music app workflow"
    printf '%s\n' "  ./scripts/workflow.sh validate  Validate Lua listening rules and build the React UI"
    printf '%s\n' "  ./scripts/workflow.sh ui        Run the Vite React UI"
    printf '%s\n' "  ./scripts/workflow.sh api       Run the Spotify API server"
    printf '%s\n' "  ./scripts/workflow.sh dev       Run UI and API together"
    ;;
esac
#!/bin/zsh
cd "$(dirname "$0")"

URL="http://127.0.0.1:4173/app/index.html"

if curl -fsS "http://127.0.0.1:4173/api/state" >/dev/null 2>&1; then
  open "$URL"
  echo "Portfolio monitor is already running:"
  echo "$URL"
  exit 0
fi

open "$URL"
echo "Starting Portfolio Rebalancing Monitor..."
echo "$URL"
echo ""
echo "Keep this Terminal window open while using the app."
echo "Press Ctrl+C here to stop the local server."
echo ""
node server.mjs

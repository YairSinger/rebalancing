#!/bin/zsh
set -e

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it first, then rerun this script."
  exit 1
fi

mkdir -p data

if [ ! -f data/state.json ]; then
  cp data/state.example.json data/state.json
  echo "Created data/state.json from data/state.example.json"
else
  echo "Keeping existing data/state.json"
fi

chmod +x run-app.command
chmod +x install-app.command

echo ""
echo "Installed Portfolio Rebalancing Monitor."
echo "Run it with:"
echo "  ./run-app.command"
echo ""
echo "Then open:"
echo "  http://127.0.0.1:4173/app/index.html"

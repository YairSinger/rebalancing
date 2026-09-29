# Portfolio Rebalancing Monitor

Start the local app with `node server.mjs` and open http://127.0.0.1:4173/app/index.html. Import a bank XLSX snapshot from the app. Portfolio state is saved to `data/state.json` by the local server (or IndexedDB without it).

## Profit tracking proposal

The importer reads a **reported ILS profit/loss amount** (preferred) or **total ILS acquisition cost**, then stores cost basis and unrealized profit per holding in each snapshot and local state. Dashboard totals exclude uninvested cash and show coverage, since missing cost must not be treated as zero. The History tab graphs full-coverage snapshot totals only; earlier snapshots with no basis remain unknown and require re-import to backfill. Negative values are red. This is unrealized profit on holdings still held, not a lifetime accumulated/realized-return calculation. Deposits, withdrawals, dividends, fees, FX, and sales cannot be inferred from current holdings alone.

The report's exact profit/cost header and currency units still need verification against a real report. Per-unit purchase prices are intentionally **not** used until the report's quote units, currency and FX conversion are known. No bank exports or private state are committed: `inputs/`, `outputs/`, and `data/state.json` are ignored. Run `node --test test/*.test.mjs` for synthetic parser checks.

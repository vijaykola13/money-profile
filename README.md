# CashPilot

**Your money. Your next move.**

Steady pay for irregular income. Bring in a bank statement and the app reconciles it, sorts business from
personal, pays you a steady paycheck from a holding pot, sets tax aside, plans quarterly tax payments, tracks
accountable-plan reimbursements and exports to QuickBooks.

## Where the data comes from

The user chooses, at the top of the page:

- **Upload files** (default): a bank CSV in any column order. It is mapped once, then shared by every tab. It stays in the browser.
- **Connect live** (advanced preview): a bank (Plaid sandbox) and brokerage (Alpaca paper). The tabs switch to the ones live data
  can support (Overview, Stocks, QuickBooks, Connections), and every one runs on live data only. Needs the server environment
  variables listed on the Connections tab.

## Tabs

Upload files: Home · Import · Reconcile · Paycheck · Tax planner · Accountable plan · QuickBooks · Report
Connect live: Overview · Stocks · QuickBooks · Connections

## Run

```bash
npm run dev      # http://localhost:5173, Netlify functions run locally from .env
npm test         # engine and function tests
npm run build    # production build into dist/
```

## Layout

- `js/*.mjs` — pure engines (import mapping, reconciliation, paycheck, tax planner, forecast, books summary, QuickBooks export), unit tested
- `src/lib/data-store.tsx` — the shared transaction store and the upload/live choice
- `src/components/dashboard/` — one component per tab
- `netlify/functions/` — Plaid, Alpaca and optional Claude (`ai-map`, `ai-tag`) functions; keys stay server-side
- `public/samples/` — sample statement and answer key

## Known limits

- Sandbox and sample data only; live mode shares one sandbox connection (per-user connections need sign-in).
- Tax figures are federal planning estimates. The 2025 parameters were checked against published sources (see js/tax2025.mjs) but Rev. Proc. 2024-40 was not read directly.
- QuickBooks is a CSV export, not a direct sync. Google sign-in and Drive import are built behind settings but untested against Google (no client ID yet).
- The Claude path is tested against a mock, not the live API.

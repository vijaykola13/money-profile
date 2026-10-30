# Money Profile

Spending profile, tax estimate and portfolio-behavior insights. Runs on built-in demo personas, or on live
sandbox data from Plaid (bank) and Alpaca (market data and orders) when their keys are set.

Features:

1. **Spending profile** — Saver / Balanced / Stretched from savings rate, fixed-versus-discretionary spend and income variability.
2. **2025 US federal tax estimate** — brackets, standard deduction, self-employment tax, refund or amount owed.
3. **Panic-sell detection** — flags sells that cluster during a drawdown and shows what holding would have been worth, on a simulated price series with a crash.

Static site (HTML/CSS/JS, no backend), so it deploys to Netlify as-is.

## Run

```bash
npm run generate   # regenerate data/demo.js (seeded, deterministic)
npm test           # engine tests
npm start          # serve at http://localhost:3000
```

## Layout

- `js/engine.js` — profile, tax and panic-sell logic (no DOM, unit tested)
- `js/tax2025.js` — 2025 federal parameters. **Not yet verified against the IRS.**
- `scripts/generate_data.js` — builds `data/demo.js` (personas, ledger, price series)
- `js/app.js`, `index.html`, `styles.css` — UI

## Known limits

- Tax: federal only, standard deduction only, no credits, no state tax, no capital gains yet.
- Prices are simulated, not real market data.
- The buy/hold view is a trend and drawdown rule of thumb, not a recommendation.

// Generates fully synthetic demo data: one price series with a crash and three personas.
// Usage: node scripts/generate_data.js   -> writes data/demo.js
const fs = require('fs');
const path = require('path');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2025);
function gauss() {
  const u = 1 - rand(), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Business days of 2025.
const dates = [];
for (let d = new Date(Date.UTC(2025, 0, 2)); d <= new Date(Date.UTC(2025, 11, 31)); d.setUTCDate(d.getUTCDate() + 1)) {
  if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.push(d.toISOString().slice(0, 10));
}

// Calm drift, a ~30-day crash, then a recovery.
const CRASH_START = 110, CRASH_END = 140;
const prices = [];
let p = 100;
dates.forEach((date, i) => {
  if (i > 0) {
    const drift = i < CRASH_START ? 0.0005 : i < CRASH_END ? -0.012 : 0.0025;
    p *= Math.exp(drift + 0.008 * gauss());
  }
  prices.push({ date, close: Math.round(p * 100) / 100 });
});

// First day the crash is 15% below its running peak: the personas react around here.
let peak = 0, panicDay = -1;
prices.forEach((x, i) => {
  peak = Math.max(peak, x.close);
  if (panicDay < 0 && i >= CRASH_START && x.close <= peak * 0.85) panicDay = i;
});
if (panicDay < 0) throw new Error('crash did not reach -15%; adjust seed or drift');

const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`);
const jitter = (base, pct) => Math.round(base * (1 + (rand() - 0.5) * 2 * pct));

function ledger(monthlyIncome, incomeJitter, expenses, extraIncome) {
  const tx = [];
  months.forEach(m => {
    tx.push({ month: m, category: 'Salary', type: 'income', amount: jitter(monthlyIncome, incomeJitter) });
    if (extraIncome) tx.push({ month: m, category: 'Gig income', type: 'income', amount: jitter(extraIncome, 0.45) });
    Object.entries(expenses).forEach(([category, base]) => {
      tx.push({ month: m, category, type: 'expense', amount: jitter(base, base > 600 ? 0.01 : 0.12) });
    });
  });
  return tx;
}

const personas = [
  {
    id: 'avery', name: 'Avery', tagline: 'Steady salary, spends below income, holds through the dip',
    tax: { filingStatus: 'single', wages: 84000, selfEmployment: 0, otherIncome: 0, withholding: 9800 },
    transactions: ledger(5900, 0, {
      Rent: 1800, Utilities: 200, Insurance: 250, Groceries: 500, Dining: 200,
      Transport: 250, Entertainment: 150, Subscriptions: 60
    }),
    trades: [
      { day: 0, side: 'buy', shares: 200 },
      { day: panicDay + 5, side: 'buy', shares: 50 }
    ]
  },
  {
    id: 'blake', name: 'Blake', tagline: 'Tight budget, gig income, no investments',
    tax: { filingStatus: 'single', wages: 54000, selfEmployment: 6000, otherIncome: 0, withholding: 4200 },
    transactions: ledger(3500, 0, {
      Rent: 1700, 'Car payment': 450, 'Debt payment': 400, Utilities: 220, Groceries: 550,
      Dining: 450, Shopping: 400, Subscriptions: 120, Transport: 300
    }, 450),
    trades: []
  },
  {
    id: 'casey', name: 'Casey', tagline: 'Good income, balanced budget, sells into the crash',
    tax: { filingStatus: 'mfj', wages: 108000, selfEmployment: 0, otherIncome: 0, withholding: 12500 },
    transactions: ledger(7600, 0, {
      Rent: 2800, Utilities: 280, Insurance: 380, Groceries: 1000, Dining: 700,
      Transport: 450, Entertainment: 450, Shopping: 600, Subscriptions: 90
    }),
    trades: [
      { day: 0, side: 'buy', shares: 300 },
      { day: panicDay, side: 'sell', shares: 120 },
      { day: panicDay + 3, side: 'sell', shares: 105 }
    ]
  }
];

const out = {
  disclaimer: 'Sample data. Not real prices, people or accounts.',
  ticker: 'DEMO', panicDay, prices, personas
};
const file = path.join(__dirname, '..', 'data', 'demo.mjs');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, 'export default ' + JSON.stringify(out) + ';\n');
const lo = Math.min(...prices.map(x => x.close)), hi = Math.max(...prices.map(x => x.close));
console.log(`wrote ${file}`);
console.log(`days=${prices.length} start=${prices[0].close} low=${lo} high=${hi} end=${prices.at(-1).close} panicDay=${panicDay} (${prices[panicDay].date})`);

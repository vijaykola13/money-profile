// Pure converters from provider payloads (Plaid, Alpaca) to the shapes engine.js expects.
// Kept free of network code so they are unit tested with fixtures.

const SKIP = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'BANK_FEES']);
const PAYROLL = /payroll|direct dep|salary|paycheck/i;

// Plaid reports outflows as positive amounts and inflows as negative.
function mapPlaidTransactions(added) {
  const rows = [];
  for (const t of added) {
    const pfc = t.personal_finance_category || {};
    const primary = pfc.primary || '';
    const detailed = pfc.detailed || '';
    if (SKIP.has(primary) || !t.date) continue;
    const month = t.date.slice(0, 7);
    const base = { month, date: t.date, name: t.name || '', id: t.transaction_id || '', pending: !!t.pending };

    if (primary === 'INCOME' || t.amount < 0) {
      // Test data sometimes files paychecks under other categories, so also match on the payee name.
      if (primary === 'INCOME' || primary === '' || PAYROLL.test(t.name || '')) {
        rows.push({ ...base, category: 'Salary', type: 'income', amount: Math.abs(t.amount) });
      }
      continue; // refunds, card payments and other credits are ignored
    }
    rows.push({ ...base, category: expenseCategory(primary, detailed), type: 'expense', amount: t.amount });
  }
  return rows;
}

function expenseCategory(primary, detailed) {
  switch (primary) {
    case 'RENT_AND_UTILITIES': return detailed.includes('RENT') ? 'Rent' : 'Utilities';
    case 'FOOD_AND_DRINK': return detailed.includes('GROCERIES') ? 'Groceries' : 'Dining';
    case 'TRANSPORTATION': return 'Transport';
    case 'ENTERTAINMENT': return 'Entertainment';
    case 'GENERAL_MERCHANDISE': return 'Shopping';
    case 'GENERAL_SERVICES': return detailed.includes('INSURANCE') ? 'Insurance' : 'Other';
    case 'LOAN_PAYMENTS': return detailed.includes('CAR') ? 'Car payment' : 'Debt payment';
    default: return 'Other';
  }
}

function mapAlpacaBars(bars) {
  return bars.map(b => ({ date: b.t.slice(0, 10), close: b.c }));
}

// Orders -> trades indexed by day in the price series (first bar on or after the fill date).
function mapAlpacaOrders(orders, prices) {
  const trades = [];
  for (const o of orders) {
    const qty = Number(o.filled_qty);
    if (!o.filled_at || !(qty > 0)) continue;
    const date = o.filled_at.slice(0, 10);
    const day = prices.findIndex(p => p.date >= date);
    if (day < 0) continue;
    trades.push({ day, side: o.side, shares: qty });
  }
  return trades.sort((a, b) => a.day - b.day);
}

const num = (v) => (v == null || v === '' ? null : Number(v));

function mapAlpacaBarsFull(bars) {
  return bars.map((b) => ({ date: b.t.slice(0, 10), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
}

// Alpaca reports percentages as fractions (0.0123 = 1.23%).
function mapAlpacaPositions(positions) {
  return positions.map((p) => ({
    symbol: p.symbol, qty: num(p.qty), avgEntry: num(p.avg_entry_price), price: num(p.current_price),
    marketValue: num(p.market_value), pl: num(p.unrealized_pl), plPct: num(p.unrealized_plpc), dayPct: num(p.change_today)
  }));
}

function mapAlpacaAccount(a) {
  return { equity: num(a.equity), lastEquity: num(a.last_equity), cash: num(a.cash), buyingPower: num(a.buying_power) };
}

function mapOrderRows(orders) {
  return orders
    .filter((o) => o.filled_at || o.submitted_at)
    .map((o) => ({
      date: (o.filled_at || o.submitted_at).slice(0, 10), side: o.side, qty: num(o.filled_qty) || num(o.qty),
      price: num(o.filled_avg_price), status: o.status, type: o.type
    }));
}

module.exports = {
  mapPlaidTransactions, mapAlpacaBars, mapAlpacaOrders, expenseCategory,
  mapAlpacaBarsFull, mapAlpacaPositions, mapAlpacaAccount, mapOrderRows
};

// Pure logic for the POC: spending profile, federal tax estimate, panic-sell detection.
// No DOM access, so it runs in the browser and under `node --test`.
(function (root) {
  const FIXED = ['Rent', 'Utilities', 'Insurance', 'Car payment', 'Debt payment'];

  function sum(xs) { return xs.reduce((a, b) => a + b, 0); }

  function profile(transactions) {
    const income = sum(transactions.filter(t => t.type === 'income').map(t => t.amount));
    const expenses = transactions.filter(t => t.type === 'expense');
    const spent = sum(expenses.map(t => t.amount));
    const fixed = sum(expenses.filter(t => FIXED.includes(t.category)).map(t => t.amount));

    const byMonth = {};
    transactions.filter(t => t.type === 'income').forEach(t => {
      byMonth[t.month] = (byMonth[t.month] || 0) + t.amount;
    });
    const monthly = Object.values(byMonth);
    const mean = sum(monthly) / monthly.length;
    const sd = Math.sqrt(sum(monthly.map(m => (m - mean) ** 2)) / monthly.length);

    const byCategory = {};
    expenses.forEach(t => { byCategory[t.category] = (byCategory[t.category] || 0) + t.amount; });

    const savingsRate = income > 0 ? (income - spent) / income : 0;
    const label = income <= 0 ? 'Unknown'
      : savingsRate >= 0.20 ? 'Saver' : savingsRate >= 0.05 ? 'Balanced' : 'Stretched';
    return {
      income, spent, savingsRate, label,
      fixedShare: spent > 0 ? fixed / spent : 0,
      incomeVolatility: mean > 0 ? sd / mean : 0,
      byCategory
    };
  }

  function bracketTax(taxable, brackets) {
    let tax = 0, lower = 0;
    for (const [upper, rate] of brackets) {
      if (taxable > lower) tax += (Math.min(taxable, upper) - lower) * rate;
      lower = upper;
    }
    return tax;
  }

  // balance > 0 means a refund, < 0 means amount owed.
  function estimateTax(input, cfg) {
    const wages = input.wages || 0;
    const se = input.selfEmployment || 0;
    const other = input.otherIncome || 0;

    const seBase = se * cfg.seNetFactor;
    const ssRoom = Math.max(0, cfg.socialSecurityWageBase - wages);
    const seTax = se > 0
      ? Math.min(seBase, ssRoom) * cfg.socialSecurityRate * 2 + seBase * cfg.medicareRate * 2
      : 0;

    const agi = wages + se + other - seTax / 2;
    const stdDed = cfg.standardDeduction[input.filingStatus];
    const taxable = Math.max(0, agi - stdDed);
    const incomeTax = bracketTax(taxable, cfg.brackets[input.filingStatus]);
    const total = incomeTax + seTax;

    return {
      agi, standardDeduction: stdDed, taxable, incomeTax, seTax, total,
      ficaOnWages: Math.min(wages, cfg.socialSecurityWageBase) * cfg.socialSecurityRate + wages * cfg.medicareRate,
      effectiveRate: (wages + se + other) > 0 ? total / (wages + se + other) : 0,
      balance: (input.withholding || 0) - total
    };
  }

  // Replays trades against the price series and flags sell clusters made during a drawdown.
  function detectPanic(prices, trades, opts) {
    const o = Object.assign({ drawdown: 0.10, soldFraction: 0.25, clusterDays: 5, lookback: 60 }, opts);
    const last = prices[prices.length - 1].close;
    const sorted = trades.slice().sort((a, b) => a.day - b.day);

    let shares = 0;
    const clusters = [];
    for (const t of sorted) {
      if (t.side === 'buy') { shares += t.shares; continue; }
      const prev = clusters[clusters.length - 1];
      if (prev && t.day - prev.lastDay <= o.clusterDays) {
        prev.sold += t.shares; prev.lastDay = t.day; prev.proceeds += t.shares * prices[t.day].close;
        prev.days.push(t.day);
      } else {
        clusters.push({ firstDay: t.day, lastDay: t.day, days: [t.day], sold: t.shares,
          before: shares, proceeds: t.shares * prices[t.day].close });
      }
      shares -= t.shares;
    }

    return clusters.map(c => {
      const from = Math.max(0, c.firstDay - o.lookback);
      const peak = Math.max(...prices.slice(from, c.firstDay + 1).map(p => p.close));
      const drawdown = 1 - prices[c.lastDay].close / peak;
      const soldFraction = c.before > 0 ? c.sold / c.before : 0;
      const heldValue = c.sold * last;
      return {
        days: c.days, date: prices[c.firstDay].date, drawdown, soldFraction,
        sold: c.sold, proceeds: c.proceeds, heldValue, regret: heldValue - c.proceeds,
        flagged: drawdown >= o.drawdown && soldFraction >= o.soldFraction
      };
    });
  }

  // Educational rule-of-thumb view of the price series at a given day. Not advice.
  function signal(prices, day) {
    const window = prices.slice(Math.max(0, day - 49), day + 1).map(p => p.close);
    const ma50 = sum(window) / window.length;
    const price = prices[day].close;
    const peak = Math.max(...prices.slice(0, day + 1).map(p => p.close));
    const drawdown = 1 - price / peak;
    let trend = price >= ma50 ? 'Uptrend' : 'Downtrend';
    let view;
    if (drawdown >= 0.10 && price < ma50) view = 'Drawdown — review your plan; a drop alone is not a reason to sell';
    else if (price >= ma50 && drawdown < 0.05) view = 'Trend intact — hold';
    else view = 'Mixed — hold and monitor';
    return { price, ma50, drawdown, trend, view };
  }

  const api = { profile, estimateTax, detectPanic, signal, bracketTax, FIXED };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);

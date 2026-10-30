// Paycheck smoothing for irregular income: deposits go into a holding pot, a tax set-aside comes
// out of each deposit, and a fixed paycheck is paid from the pot at the end of every month.
// Pure functions, no DOM. The set-aside rate is an estimate, not tax advice.

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

const monthOf = d => d.slice(0, 7);
export function monthsBetween(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ey, em] = last.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Income per calendar month, including months with no deposit. `allDates` sets the span so quiet months count. */
export function incomeByMonth(incomeRows, allDates) {
  const dates = (allDates.length ? allDates : incomeRows.map(r => r.date)).slice().sort();
  if (!dates.length) return { months: [], income: [] };
  const months = monthsBetween(monthOf(dates[0]), monthOf(dates[dates.length - 1]));
  const sums = new Map(months.map(m => [m, 0]));
  for (const r of incomeRows) {
    const m = monthOf(r.date);
    if (sums.has(m)) sums.set(m, round2(sums.get(m) + r.amount));
  }
  return { months, income: months.map(m => sums.get(m)) };
}

/** Runs the pot month by month. A month the pot cannot cover is a shortfall, not a negative balance. */
export function simulate({ income, paycheck, taxRate, startPot = 0, startTaxPot = 0 }) {
  let pot = startPot, taxPot = startTaxPot;
  return income.map(inc => {
    const setAside = round2(inc * taxRate);
    const net = round2(inc - setAside);
    const available = round2(pot + net);
    const paid = round2(Math.min(paycheck, Math.max(0, available)));
    const shortfall = round2(paycheck - paid);
    pot = round2(available - paid);
    taxPot = round2(taxPot + setAside);
    return { income: inc, setAside, net, paid, shortfall, pot, taxPot };
  });
}

/** The largest whole-dollar paycheck that the pot would have covered every month of this history. */
export function maxSafePaycheck({ income, taxRate, startPot = 0 }) {
  const ok = p => simulate({ income, paycheck: p, taxRate, startPot }).every(r => r.shortfall === 0);
  const total = income.reduce((s, x) => s + x * (1 - taxRate), startPot);
  let lo = 0, hi = Math.max(0, Math.floor(total));
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(mid)) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** Standard deviation over mean of the monthly values; 0 when there is no income or no swing. */
export function swing(values) {
  const mean = values.reduce((s, x) => s + x, 0) / (values.length || 1);
  if (mean <= 0) return 0;
  const variance = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** A set-aside rate from an estimated total tax on the annual income, plus a safety buffer, rounded up to a whole percent. */
export function suggestRate(totalTax, annualIncome, buffer = 0.02) {
  if (!(annualIncome > 0)) return 0;
  return Math.min(0.6, Math.ceil((totalTax / annualIncome + buffer) * 100) / 100);
}

export function summarize(rows, paycheck) {
  const last = rows[rows.length - 1];
  const pots = rows.map(r => r.pot);
  return {
    totalIncome: round2(rows.reduce((s, r) => s + r.income, 0)),
    totalSetAside: round2(rows.reduce((s, r) => s + r.setAside, 0)),
    totalPaid: round2(rows.reduce((s, r) => s + r.paid, 0)),
    shortfalls: rows.filter(r => r.shortfall > 0).length,
    endPot: last ? last.pot : 0,
    minPot: pots.length ? Math.min(...pots) : 0,
    runwayMonths: paycheck > 0 && last ? Math.round((last.pot / paycheck) * 10) / 10 : 0
  };
}

/** Twelve months of invented, deliberately uneven freelance income, for demonstrations. */
export const DEMO_IRREGULAR = {
  months: ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
  income: [2100, 9800, 0, 6400, 12300, 1900, 0, 8700, 5200, 11000, 700, 7300]
};

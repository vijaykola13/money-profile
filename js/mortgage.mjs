// Mortgage engine: reads a servicer payment history (or bank payments), totals interest by year and works out
// the home-office share and the Schedule A (itemized) deduction. Pure functions, no DOM.
// Not tax advice: the loan limits and the deduction rules are inputs to check with a CPA, and the Form 1098
// from the lender is the number that gets filed.
import { parseCsv, parseAmount } from './accountable.mjs';
import TAX2025 from './tax2025.mjs';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Home mortgage interest is deductible on the first $750,000 of debt, or $1,000,000 for loans taken out
// on or before December 15, 2017 (IRS Publication 936).
export const LOAN_LIMIT = { current: 750000, grandfathered: 1000000 };

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

/* ---------- reading a file ---------- */

function parseDate(raw) {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  return m ? `20${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

/** Finds the columns by header. Escrow-like and fee-like columns are summed, so there can be several of each. */
export function mapColumns(headers) {
  const h = headers.map(x => x.trim());
  const idx = (re, not) => h.findIndex(x => re.test(x) && !(not && not.test(x)));
  const all = (re, not) => h.map((x, i) => (re.test(x) && !(not && not.test(x)) ? i : -1)).filter(i => i >= 0);

  const principal = idx(/principal/i, /balance|remaining|ending|beginning/i);
  const interest = idx(/interest/i, /rate|balance|ytd|year/i);
  const balance = idx(/balance|remaining|ending/i, /beginning|escrow/i);
  const escrow = all(/escrow|impound|taxes?\b|insurance|\bpmi\b|\bmip\b|hazard/i, /balance|principal|interest/i);
  const fees = all(/\bfees?\b|late|other charges/i);
  const used = new Set([principal, interest, balance, ...escrow, ...fees]);
  const date = idx(/^date$/i) >= 0 ? idx(/^date$/i) : idx(/date|posted|paid on|due/i);
  const payment = h.findIndex((x, i) => !used.has(i) && i !== date && /total|payment|amount|paid|debit|withdrawal/i.test(x) && !/principal|interest|escrow|balance|date/i.test(x));

  const mapping = { date, payment, principal, interest, balance, escrow, fees };
  const warnings = [];
  if (date < 0) warnings.push('No date column found.');
  if (payment < 0 && (principal < 0 || interest < 0)) warnings.push('No payment amount column found, and principal and interest are not both there to add up.');
  return { mapping, warnings };
}

const num = raw => {
  const n = parseAmount(raw);
  return Number.isNaN(n) ? NaN : Math.abs(n);
};

/**
 * Turns CSV text into payments. Rows it cannot read go to `skipped`. When there is no interest column and it
 * cannot be worked out from the other columns, `hasInterest` is false and the caller must estimate it from loan terms.
 */
export function readMortgage(text) {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], skipped: [], duplicates: 0, mapping: null, warnings: ['The file has no data rows.'], hasInterest: false };
  const { mapping: m, warnings } = mapColumns(table[0]);
  if (m.date < 0 || (m.payment < 0 && (m.principal < 0 || m.interest < 0))) return { rows: [], skipped: [], duplicates: 0, mapping: m, warnings, hasInterest: false };

  const rows = [], skipped = [], seen = new Set();
  let duplicates = 0;
  table.slice(1).forEach((r, i) => {
    const date = parseDate(r[m.date]);
    const sum = cols => cols.reduce((s, c) => s + (Number.isNaN(num(r[c])) ? 0 : num(r[c])), 0);
    const escrow = round2(sum(m.escrow));
    const fees = round2(sum(m.fees));
    let payment = m.payment >= 0 ? num(r[m.payment]) : NaN;
    let principal = m.principal >= 0 ? num(r[m.principal]) : NaN;
    let interest = m.interest >= 0 ? num(r[m.interest]) : NaN;
    const balance = m.balance >= 0 && !Number.isNaN(num(r[m.balance])) ? num(r[m.balance]) : null;
    let derived = false;

    if (Number.isNaN(payment) && !Number.isNaN(principal) && !Number.isNaN(interest)) payment = round2(principal + interest + escrow + fees);
    if (!date || Number.isNaN(payment) || payment <= 0) return skipped.push({ line: i + 2, raw: r.join(',') });
    if (Number.isNaN(interest) && !Number.isNaN(principal)) { interest = round2(payment - principal - escrow - fees); derived = true; }
    else if (Number.isNaN(principal) && !Number.isNaN(interest)) { principal = round2(payment - interest - escrow - fees); derived = true; }
    if (!Number.isNaN(interest) && interest < 0) return skipped.push({ line: i + 2, raw: r.join(',') });

    const key = `${date}|${payment}|${interest}`;
    if (seen.has(key)) { duplicates++; return; }
    seen.add(key);
    rows.push({
      date, year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), payment: round2(payment),
      principal: Number.isNaN(principal) ? null : round2(principal),
      interest: Number.isNaN(interest) ? null : round2(interest),
      escrow, fees, balance, derived, estimated: false
    });
  });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const hasInterest = rows.length > 0 && rows.every(r => r.interest !== null);
  if (rows.length && !hasInterest) warnings.push('This file shows what was paid but not how much of it was interest. Enter your loan details to estimate it.');
  return { rows, skipped, duplicates, mapping: m, warnings, hasInterest };
}

/** Pulls the mortgage payments out of bank transactions (negative amounts are money out). */
export function paymentsFromTransactions(transactions) {
  const rows = transactions
    .filter(t => t.amount < 0 && /HOME LOANS|MORTGAGE/i.test(t.name))
    .map(t => ({
      date: t.date, year: Number(t.date.slice(0, 4)), month: Number(t.date.slice(5, 7)), payment: round2(Math.abs(t.amount)),
      principal: null, interest: null, escrow: 0, fees: 0, balance: null, derived: false, estimated: false
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

/**
 * Splits each payment into interest and principal from the loan terms: interest is the balance times the
 * monthly rate, and the rest of the principal-and-interest part pays the loan down. An estimate.
 * terms: { rate (annual percent), balance (owed before the first payment in the file), escrow (monthly) }.
 */
export function estimate(rows, terms) {
  const rate = Number(terms?.rate);
  let bal = Number(terms?.balance);
  const escrow = Math.max(0, Number(terms?.escrow) || 0);
  if (!rows.length || !(rate >= 0) || !(bal > 0)) return { rows, ok: false };
  const out = rows.map(r => {
    const pi = Math.max(0, round2(r.payment - escrow - r.fees));
    const interest = Math.min(pi, round2((bal * rate) / 1200));
    const principal = round2(pi - interest);
    bal = Math.max(0, round2(bal - principal));
    return { ...r, interest, principal, escrow: round2(escrow), balance: bal, derived: true, estimated: true };
  });
  return { rows: out, ok: true };
}

/* ---------- summaries ---------- */

export function byYear(rows) {
  const map = new Map();
  for (const r of rows) {
    const y = map.get(r.year) ?? { year: r.year, count: 0, payment: 0, principal: 0, interest: 0, escrow: 0, fees: 0, endBalance: null, partial: false };
    y.count++;
    y.payment += r.payment;
    y.principal += r.principal ?? 0;
    y.interest += r.interest ?? 0;
    y.escrow += r.escrow;
    y.fees += r.fees;
    if (r.balance !== null) y.endBalance = r.balance;
    map.set(r.year, y);
  }
  return [...map.values()]
    .sort((a, b) => a.year - b.year)
    .map(y => ({
      ...y, payment: round2(y.payment), principal: round2(y.principal), interest: round2(y.interest), escrow: round2(y.escrow), fees: round2(y.fees),
      partial: y.count < 12,
      interestShare: y.interest + y.principal > 0 ? y.interest / (y.interest + y.principal) : 0
    }));
}

/** Twelve monthly values for one year (a month with no payment is 0). */
export function monthly(rows, year) {
  const out = { interest: Array(12).fill(0), principal: Array(12).fill(0), escrow: Array(12).fill(0), payment: Array(12).fill(0) };
  for (const r of rows) {
    if (r.year !== year) continue;
    out.interest[r.month - 1] += r.interest ?? 0;
    out.principal[r.month - 1] += r.principal ?? 0;
    out.escrow[r.month - 1] += r.escrow + r.fees;
    out.payment[r.month - 1] += r.payment;
  }
  for (const k of Object.keys(out)) out[k] = out[k].map(round2);
  return out;
}

/** A months-by-years table of one measure: the pivot. */
export function pivot(rows, metric = 'interest') {
  const years = [...new Set(rows.map(r => r.year))].sort((a, b) => a - b);
  const cells = MONTHS.map(() => years.map(() => 0));
  for (const r of rows) {
    const v = metric === 'escrow' ? r.escrow + r.fees : r[metric] ?? 0;
    cells[r.month - 1][years.indexOf(r.year)] += v;
  }
  const rounded = cells.map(row => row.map(round2));
  const totals = years.map((_, i) => round2(rounded.reduce((s, row) => s + row[i], 0)));
  const max = Math.max(0, ...rounded.flat());
  return { years, months: MONTHS, cells: rounded, totals, max };
}

/** Average balance across a year's payments, for the loan limit. Null when the file has no balances. */
export function averageBalance(rows, year) {
  const b = rows.filter(r => r.year === year && r.balance !== null).map(r => r.balance);
  return b.length ? round2(b.reduce((s, x) => s + x, 0) / b.length) : null;
}

/* ---------- the deduction ---------- */

/**
 * input: { interest, avgBalance, filing: 'single'|'mfj', officeSqft, homeSqft, otherItemized,
 *          grandfathered (loan taken on or before 2017-12-15), marginalRate (0-1), reported1098 }
 * Income-tax effect only: self-employment tax savings are not counted.
 */
export function deduction(input) {
  const interest = Math.max(0, Number(input.interest) || 0);
  const limit = input.grandfathered ? LOAN_LIMIT.grandfathered : LOAN_LIMIT.current;
  const avg = Number(input.avgBalance) > 0 ? Number(input.avgBalance) : null;
  const limitRatio = avg && avg > limit ? limit / avg : 1;
  const allowed = round2(interest * limitRatio);

  const office = Number(input.officeSqft) || 0;
  const home = Number(input.homeSqft) || 0;
  const officePct = home > 0 && office > 0 ? Math.min(100, (office / home) * 100) : 0;
  const business = round2((allowed * officePct) / 100);
  const personal = round2(allowed - business);

  const standard = TAX2025.standardDeduction[input.filing === 'mfj' ? 'mfj' : 'single'];
  const other = Math.max(0, Number(input.otherItemized) || 0);
  const itemized = round2(personal + other);
  const itemize = itemized > standard;
  const benefitDeduction = Math.max(standard, itemized) - Math.max(standard, other);
  const rate = Math.min(1, Math.max(0, Number(input.marginalRate) || 0));
  const businessSaved = round2(business * rate);
  const personalSaved = round2(benefitDeduction * rate);

  const reported = input.reported1098 === '' || input.reported1098 === undefined || input.reported1098 === null ? null : Number(input.reported1098);
  const diff = reported !== null && Number.isFinite(reported) ? round2(interest - reported) : null;

  return {
    interest: round2(interest), limit, limitRatio, capped: limitRatio < 1, allowed,
    officePct, business, personal, standard, other, itemized, itemize,
    shortOfStandard: itemize ? 0 : round2(standard - itemized),
    businessSaved, personalSaved, totalSaved: round2(businessSaved + personalSaved),
    diff, matches: diff !== null && Math.abs(diff) <= 1
  };
}

/** Interest paid in each month, keyed 'YYYY-MM'. Used by the accountable plan to reimburse interest only. */
export function interestByMonth(rows) {
  const out = {};
  for (const r of rows) {
    if (r.interest === null) continue;
    const k = r.date.slice(0, 7);
    out[k] = round2((out[k] ?? 0) + r.interest);
  }
  return out;
}

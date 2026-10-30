// The one shared shape every tab reads: a list of { date (ISO), name, amount (signed) }.
// A canonical CSV (US Bank layout) lets files and live bank feeds look identical to the tools.
import { readTransactions } from './accountable.mjs';

const q = v => `"${String(v).replace(/"/g, '""')}"`;

export function toCanonicalCsv(txns) {
  const lines = txns.map(t => [t.date, t.amount > 0 ? 'CREDIT' : 'DEBIT', t.name, '', t.amount.toFixed(2)].map(q).join(','));
  return ['Date', 'Transaction', 'Name', 'Memo', 'Amount'].map(q).join(',') + '\n' + lines.join('\n') + (lines.length ? '\n' : '');
}

export function fromCanonicalCsv(text) {
  return readTransactions(text).transactions;
}

/** First and last date and the number of calendar months a dataset touches. */
export function describe(txns) {
  if (!txns.length) return { count: 0, first: null, last: null, months: 0 };
  const dates = txns.map(t => t.date).sort();
  const [fy, fm] = dates[0].split('-').map(Number);
  const [ly, lm] = dates[dates.length - 1].split('-').map(Number);
  return { count: txns.length, first: dates[0], last: dates[dates.length - 1], months: (ly - fy) * 12 + (lm - fm) + 1 };
}

// Statement reconciliation: tick transactions until the computed balance equals the statement's
// ending balance. Pure functions, no DOM. Amounts are signed as they appear on a bank export
// (money out is negative).
//
// Checking: balance = starting + sum(amounts).
// Credit card: the balance is what is owed, so charges (negative) raise it: balance = starting - sum(amounts).

export const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const sign = type => (type === 'credit' ? -1 : 1);
const money = n => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Balance after applying the given rows to the starting balance. */
export function computedBalance(type, starting, rows) {
  return round2(starting + sign(type) * rows.reduce((s, r) => s + r.amount, 0));
}

/** Computed minus statement ending balance; 0 means the ticked rows explain the statement. */
export function difference(type, starting, ending, tickedRows) {
  return round2(computedBalance(type, starting, tickedRows) - ending);
}

/** Gives every row a stable key; identical rows get #2, #3 so they are not mistaken for duplicates of each other. */
export function withKeys(rows) {
  const seen = new Map();
  return rows.map(r => {
    const base = `${r.date}|${r.name}|${r.amount.toFixed(2)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...r, key: `${base}#${n}` };
  });
}

/** Skips rows that were already reconciled in an earlier import. */
export function skipLocked(rows, lockedKeys) {
  const locked = new Set(lockedKeys);
  const fresh = [], skipped = [];
  for (const r of rows) (locked.has(r.key) ? skipped : fresh).push(r);
  return { fresh, skipped };
}

const monthOf = d => d.slice(0, 7);
function monthsBetween(a, b) {
  const out = [];
  let [y, m] = a.split('-').map(Number);
  const [ey, em] = b.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Likely reasons the numbers do not agree, strongest evidence first. */
export function suggestCauses({ type, starting, ending, rows, tickedIds }) {
  const s = sign(type);
  const ticked = rows.filter(r => tickedIds.has(r.id));
  const unticked = rows.filter(r => !tickedIds.has(r.id));
  const diff = difference(type, starting, ending, ticked);
  if (diff === 0) return [];

  const causes = [];
  const unticksTotal = round2(unticked.reduce((t, r) => t + r.amount, 0));

  if (unticked.length && round2(diff + s * unticksTotal) === 0) {
    causes.push({ kind: 'unticked', title: 'Unticked transactions', detail: `Ticking the ${unticked.length} unticked transaction${unticked.length === 1 ? '' : 's'} closes the gap exactly. Use Check all.` });
  } else if (unticked.length) {
    causes.push({ kind: 'unticked', title: 'Unticked transactions', detail: `${unticked.length} transaction${unticked.length === 1 ? ' is' : 's are'} not ticked (${money(unticksTotal)} net). Tick the ones that cleared the bank.` });
  }

  // A transaction on the statement but absent from the file leaves the gap equal to its amount.
  const m = round2(-s * diff);
  if (unticked.length === 0 || causes[0]?.detail.includes('closes') === false) {
    const same = rows.filter(r => Math.abs(r.amount - m) < 0.005);
    const byName = new Map();
    for (const r of same) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
    const dates = rows.map(r => r.date).sort();
    const span = dates.length ? monthsBetween(monthOf(dates[0]), monthOf(dates[dates.length - 1])) : [];
    let found = false;
    for (const [name, list] of byName) {
      if (list.length < 3) continue;
      const have = new Set(list.map(r => monthOf(r.date)));
      const gaps = span.filter(x => !have.has(x));
      if (gaps.length === 1) {
        causes.push({ kind: 'missing', title: 'Missing transaction', detail: `${name} is ${money(m)} every month except ${gaps[0]}. A transaction of ${money(m)} is probably on the statement but missing from your file.` });
        found = true;
        break;
      }
    }
    if (!found) causes.push({ kind: 'missing', title: 'Missing transaction', detail: `A transaction of ${money(m)} (${m < 0 ? 'money out' : 'money in'}) may be on the statement but missing from your file.` });
  }

  const dupes = rows.filter(r => /#([2-9])$/.test(r.key ?? '') && Math.abs(Math.abs(r.amount) - Math.abs(diff)) < 0.005);
  if (dupes.length) causes.push({ kind: 'duplicate', title: 'Possible duplicate', detail: `${dupes[0].name} on ${dupes[0].date} (${money(dupes[0].amount)}) appears more than once. It may have been imported twice.` });

  const flipped = rows.find(r => Math.abs(2 * Math.abs(r.amount) - Math.abs(diff)) < 0.005);
  if (flipped) causes.push({ kind: 'sign', title: 'Possible wrong sign', detail: `${flipped.name} on ${flipped.date} is ${money(flipped.amount)}. If its sign is wrong, the gap would be exactly ${money(diff)}.` });

  if (Math.round(Math.abs(diff) * 100) % 9 === 0) causes.push({ kind: 'transposed', title: 'Transposed digits', detail: 'A difference divisible by 9 cents is a common sign of two digits swapped when typing an amount or the ending balance.' });

  causes.push({ kind: 'starting', title: 'Starting balance or date', detail: 'Check that the starting balance matches the previous statement and that the file covers the same dates as the statement.' });
  return causes.slice(0, 5);
}

/** After Finish: the ending balance becomes the next starting balance, as of the last transaction date. */
export function carryForward(account, ending, tickedRows) {
  const last = tickedRows.map(r => r.date).sort().pop() ?? account.asOf;
  return { ...account, starting: round2(ending), asOf: last };
}

/** Demo helper: drops one monthly mortgage row so the reconciliation shows a mismatch. */
export function dropDemoRow(transactions) {
  const i = transactions.findIndex(t => /PACIFICA/i.test(t.name) && t.date.startsWith('2026-03'));
  if (i < 0) return { transactions, removed: null };
  return { transactions: transactions.filter((_, k) => k !== i), removed: transactions[i] };
}

// Builds CSV files in the layout QuickBooks Online accepts for bank transaction uploads.
// Pure functions, no DOM. This is a file export, not an API push: pushing straight into a QuickBooks
// company needs Intuit developer credentials and OAuth, which this app does not have.
//
// Layouts (columns in this order):
//   three-column: Date, Description, Amount        (money out is negative)
//   four-column:  Date, Description, Credit, Debit (both positive; Credit = money in, Debit = money out)

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

export const FORMATS = {
  three: { label: 'Date, Description, Amount', header: ['Date', 'Description', 'Amount'] },
  four: { label: 'Date, Description, Credit, Debit', header: ['Date', 'Description', 'Credit', 'Debit'] }
};

export const DATE_FORMATS = {
  'MM/DD/YYYY': ([y, m, d]) => `${m}/${d}/${y}`,
  'DD/MM/YYYY': ([y, m, d]) => `${d}/${m}/${y}`,
  'YYYY-MM-DD': ([y, m, d]) => `${y}-${m}-${d}`
};

export function formatDate(iso, style = 'MM/DD/YYYY') {
  const parts = String(iso).split('-');
  if (parts.length !== 3) throw new Error(`Not an ISO date: ${iso}`);
  return (DATE_FORMATS[style] ?? DATE_FORMATS['MM/DD/YYYY'])(parts);
}

/** QuickBooks rejects some symbols in descriptions, so keep a conservative character set. */
export function cleanDescription(name, max = 150) {
  return String(name ?? '')
    .replace(/[^A-Za-z0-9 .,#&'/()*@+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Converts transactions into export rows for the chosen layout. */
export function toRows(txns, { layout = 'three', dateStyle = 'MM/DD/YYYY' } = {}) {
  if (!FORMATS[layout]) throw new Error(`Unknown layout: ${layout}`);
  return txns.map(t => {
    const date = formatDate(t.date, dateStyle);
    const description = cleanDescription(t.name);
    if (layout === 'three') return [date, description, round2(t.amount).toFixed(2)];
    return [date, description, t.amount > 0 ? round2(t.amount).toFixed(2) : '', t.amount < 0 ? round2(Math.abs(t.amount)).toFixed(2) : ''];
  });
}

const esc = v => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows, layout = 'three') {
  return [FORMATS[layout].header, ...rows].map(r => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

/** Splits rows into files of at most `size` rows each (at least 1). */
export function chunk(rows, size) {
  const n = Math.max(1, Math.floor(size) || 1);
  const out = [];
  for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n));
  return out.length ? out : [[]];
}

export function summarize(txns) {
  return {
    count: txns.length,
    moneyIn: round2(txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
    moneyOut: round2(txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0))
  };
}

/** Everything the UI needs for one export run: the files, their names and the totals. */
export function buildExport(txns, { layout = 'three', dateStyle = 'MM/DD/YYYY', maxRows = 1000, baseName = 'quickbooks-import' } = {}) {
  const rows = toRows(txns, { layout, dateStyle });
  const parts = chunk(rows, maxRows);
  const files = parts.map((p, i) => ({
    name: parts.length === 1 ? `${baseName}.csv` : `${baseName}-${i + 1}-of-${parts.length}.csv`,
    rows: p.length,
    text: toCsv(p, layout)
  }));
  return { files, summary: summarize(txns) };
}

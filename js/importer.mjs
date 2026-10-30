// Import pipeline for messy bank CSVs: map columns (heuristics here; an AI suggestion can be
// passed in), validate the mapping in code, parse every row with ordinary code, and tag each
// transaction business or personal. Pure functions, no DOM.
import { parseCsv, parseAmount, readTransactions } from './accountable.mjs';

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

/* ---------- dates ---------- */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const ymd = (y, m, d) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? dt.toISOString().slice(0, 10) : null;
};

export function toIsoDate(raw) {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (m) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return ymd(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

/* ---------- column mapping ---------- */

const FIELDS = ['date', 'name', 'amount', 'debit', 'credit', 'balance'];

/** Header-based guess. Returns column indexes (or -1) for date, name, amount, debit, credit and balance. */
export function guessMapping(headers) {
  const h = headers.map(x => x.trim());
  const idx = (...patterns) => {
    for (const p of patterns) {
      const i = h.findIndex(x => p.test(x));
      if (i >= 0) return i;
    }
    return -1;
  };
  const balance = idx(/balance|\bbal\b|running/i);
  const notBal = re => h.findIndex((x, i) => i !== balance && re.test(x));
  const amount = notBal(/^(amount|amt|transaction amount|value)$/i);
  return {
    date: idx(/^(date|trans(action)? date|posted( date)?|post date|posting date|booking date|value date)$/i, /date|posted/i),
    name: idx(/^(description|payee|merchant|name|details?|transaction description|narrative)$/i, /desc|payee|merchant|name|detail/i, /memo/i),
    amount: amount >= 0 ? amount : notBal(/amount|amt/i),
    debit: notBal(/debit|withdraw|money out|paid out|charge/i),
    credit: notBal(/^(credit|deposits?|money in|paid in)$/i),
    balance
  };
}

const numericColumn = (rows, c) => rows.map(r => parseAmount(r[c]));

/** Columns whose consecutive differences equal another column's values are running balances. */
export function detectRunningBalances(rows) {
  const cols = rows.length ? rows[0].length : 0;
  if (rows.length < 6) return { balances: new Set(), matches: [] };
  const vals = Array.from({ length: cols }, (_, c) => numericColumn(rows, c));
  const usable = vals.map(v => v.filter(x => !Number.isNaN(x)).length >= rows.length * 0.8);
  const balances = new Set(), matches = [];
  for (let b = 0; b < cols; b++) {
    if (!usable[b]) continue;
    for (let a = 0; a < cols; a++) {
      if (a === b || !usable[a]) continue;
      let hit = 0, tried = 0;
      for (let i = 1; i < rows.length; i++) {
        const d = vals[b][i] - vals[b][i - 1];
        if (Number.isNaN(d) || Number.isNaN(vals[a][i])) continue;
        tried++;
        if (Math.abs(d - vals[a][i]) < 0.005 || Math.abs(d + vals[a][i]) < 0.005) hit++;
      }
      if (tried >= 5 && hit / tried >= 0.8) { balances.add(b); matches.push({ balance: b, amount: a }); }
    }
  }
  return { balances, matches };
}

/**
 * Checks a mapping (from heuristics or an AI) in code. A Balance column can never be the amount.
 * Returns { mapping, errors, notes }; `mapping` has any rejected pick repaired when a better column exists.
 */
export function validateMapping(headers, rows, mapping) {
  const errors = [], notes = [];
  const m = { ...mapping };
  const { balances, matches } = detectRunningBalances(rows);

  for (const f of ['amount', 'debit', 'credit']) {
    const c = m[f];
    if (c >= 0 && (/balance|\bbal\b|running/i.test(headers[c]) || balances.has(c))) {
      notes.push(`Rejected "${headers[c]}" as ${f}: it looks like a running balance.`);
      // Only a column with a number on every row can stand in as the amount; a Withdrawals-only column cannot.
      const full = col => rows.length > 0 && rows.filter(r => !Number.isNaN(parseAmount(r[col]))).length / rows.length >= 0.95;
      const fix = matches.find(x => x.balance === c && !/balance|\bbal\b|running/i.test(headers[x.amount]) && full(x.amount));
      if (fix && f === 'amount') { m.amount = fix.amount; notes.push(`Using "${headers[fix.amount]}" instead, since its values are the changes in "${headers[c]}".`); }
      else m[f] = -1;
    }
  }
  if (m.balance < 0 && balances.size) m.balance = [...balances][0];

  const hasAmount = m.amount >= 0 || m.debit >= 0 || m.credit >= 0;
  if (m.date < 0) errors.push('No date column found.');
  if (m.name < 0) errors.push('No description column found.');
  if (!hasAmount) errors.push('No amount column found (or a Debit and Credit pair).');

  if (m.date >= 0 && rows.length) {
    const ok = rows.filter(r => toIsoDate(r[m.date])).length / rows.length;
    if (ok < 0.8) errors.push(`Only ${Math.round(ok * 100)}% of the "${headers[m.date]}" values look like dates.`);
  }
  if (m.name >= 0 && rows.length) {
    const numeric = rows.filter(r => !Number.isNaN(parseAmount(r[m.name]))).length / rows.length;
    if (numeric > 0.5) errors.push(`"${headers[m.name]}" looks numeric, not a description.`);
  }
  const amountCol = m.amount >= 0 ? m.amount : -1;
  if (amountCol >= 0 && rows.length) {
    const numeric = rows.filter(r => !Number.isNaN(parseAmount(r[amountCol]))).length / rows.length;
    if (numeric < 0.8) errors.push(`Only ${Math.round(numeric * 100)}% of the "${headers[amountCol]}" values are numbers.`);
  }
  return { mapping: m, errors, notes };
}

/** Turns names from an AI suggestion ({date: "Posted", ...}) into column indexes; unknown names are dropped. */
export function mappingFromNames(headers, names) {
  const find = n => (typeof n === 'string' ? headers.findIndex(h => h.trim().toLowerCase() === n.trim().toLowerCase()) : -1);
  return Object.fromEntries(FIELDS.map(f => [f, find(names?.[f])]));
}

export const headerKey = headers => headers.map(h => h.trim().toLowerCase()).join('|');

/* ---------- parsing ---------- */

/** Parses every data row with the mapping. Unreadable rows and exact duplicate lines are returned, not dropped silently. */
export function applyMapping(dataRows, mapping) {
  const transactions = [], skipped = [], duplicates = [];
  const seen = new Set();
  dataRows.forEach((r, i) => {
    const line = i + 2;
    const raw = r.join(',');
    if (seen.has(raw)) return duplicates.push({ line, raw });
    seen.add(raw);

    const date = toIsoDate(r[mapping.date]);
    const name = (r[mapping.name] ?? '').trim();
    let amount = NaN;
    if (mapping.amount >= 0) amount = parseAmount(r[mapping.amount]);
    else {
      const cr = mapping.credit >= 0 ? parseAmount(r[mapping.credit]) : NaN;
      const dr = mapping.debit >= 0 ? parseAmount(r[mapping.debit]) : NaN;
      if (!Number.isNaN(cr) || !Number.isNaN(dr)) amount = round2((Number.isNaN(cr) ? 0 : Math.abs(cr)) - (Number.isNaN(dr) ? 0 : Math.abs(dr)));
    }
    if (!date) return skipped.push({ line, raw, reason: 'Date not recognised' });
    if (Number.isNaN(amount)) return skipped.push({ line, raw, reason: 'Amount not readable' });
    if (!name) return skipped.push({ line, raw, reason: 'No description' });
    transactions.push({ date, name, amount });
  });
  return { transactions, skipped, duplicates };
}

/* ---------- business or personal ---------- */

export const merchantKey = name =>
  name.toUpperCase().replace(/^(DEBIT PURCHASE|WEB AUTHORIZED PMT|ELECTRONIC WITHDRAWAL|ELECTRONIC DEPOSIT|RECURRING PAYMENT|POS|CHECKCARD)\s+/, '').replace(/[#*]?\d[\d-]*/g, '').replace(/\s+/g, ' ').trim();

const BUSINESS = [
  [/GITHUB|AWS|AMAZON WEB|GOOGLE\s*(WORKSPACE|CLOUD|ADS)|ADOBE|ZOOM|SLACK|NOTION|FIGMA|CANVA|OPENAI|ANTHROPIC|VERCEL|NETLIFY|DIGITALOCEAN|SHOPIFY|STRIPE|QUICKBOOKS|INTUIT|DROPBOX|MAILCHIMP|GODADDY|NAMECHEAP|HOSTING|SQUARESPACE|ATLASSIAN|TWILIO/, 'Software or online service used to run a business.'],
  [/WEWORK|REGUS|COWORK|STAPLES|OFFICE DEPOT|FEDEX|UPS STORE|USPS|POSTAGE/, 'Office, shipping or workspace cost.'],
  [/LINKEDIN|FACEBK|META ADS|ADVERTIS|GOOGLE ADS/, 'Advertising or marketing.'],
  [/\bCPA\b|LEGAL|ATTORNEY|ACCOUNTING|BOOKKEEP|GUSTO|\bADP\b|PAYROLL/, 'Professional or payroll service.'],
  [/AIRLINES|DELTA|UNITED AIR|SOUTHWEST|MARRIOTT|HILTON|HOTEL|UBER|LYFT/, 'Travel that is often business; confirm the purpose.', 'low'],
  [/CONSULTING|CLIENT|INVOICE|CHECK DEPOSIT/, 'Client or consulting income.'],
  [/PROGRESSIVE INS/, 'Insurance on the company car.', 'low']
];
const PERSONAL = [
  [/RALPHS|TRADER JOE|WHOLE FOODS|VONS|COSTCO|SAFEWAY|KROGER|ALBERTSONS/, 'Groceries.'],
  [/FITNESS|\bGYM\b|YOGA/, 'Gym membership.'],
  [/NETFLIX|SPOTIFY|HULU|DISNEY|HBO|APPLE MUSIC|YOUTUBE PREM/, 'Streaming or entertainment.'],
  [/CLINIC|MEDICAL|DENTAL|DENTIST|HEALTH|PHARMACY|\bRX\b|HOSPITAL|PHYS GRP|ANIMAL|VETERIN|\bVCA\b/, 'Medical or pet care.'],
  [/HOME LOANS|MORTGAGE|\bHOA\b|TREASURER|PROPERTY TAX|WATER|SDGE|ELECTRIC|COX COMM|INTERNET|COMCAST|SPECTRUM|GEICO/, 'Household or personal bill.'],
  [/TARGET|HOME DEPOT|AMAZON|AMZN|\bREI\b|BEST BUY|WALMART/, 'General retail.'],
  [/CREDIT CRD|CREDIT CARD|CARD PAYMENT/, 'Card payment; the underlying charges are unknown.']
];
const DINING = /STARBUCKS|LINKERY|PANERA|CHIPOTLE|IN N OUT|MCDONALD|RESTAURANT|CAFE|COFFEE|PIZZA|BURGER|GRILL/;

/** Rule-based tag with a one-line reason; `confidence` is 'low' when a person should look. */
export function tagLocal(txn) {
  const n = txn.name.toUpperCase();
  if (txn.amount > 0) {
    if (/MAINTENANCE FEE|SERVICE FEE|OVERDRAFT/.test(n)) return { tag: 'Personal', reason: 'Fee refund on a mixed account.', confidence: 'low', source: 'rules' };
    return { tag: 'Business', reason: /CHECK DEPOSIT|CLIENT|INVOICE/.test(n) ? 'Client payment.' : 'Money in from work or the owner.', confidence: /CONSULTING|CLIENT|CHECK DEPOSIT|INVOICE/.test(n) ? 'high' : 'low', source: 'rules' };
  }
  for (const [re, reason, conf] of BUSINESS) if (re.test(n)) return { tag: 'Business', reason, confidence: conf ?? 'high', source: 'rules' };
  for (const [re, reason] of PERSONAL) if (re.test(n)) return { tag: 'Personal', reason, confidence: 'high', source: 'rules' };
  if (DINING.test(n)) return { tag: 'Personal', reason: 'Meals can be business with a client; review if so.', confidence: 'low', source: 'rules' };
  if (/MAINTENANCE FEE|SERVICE FEE|OVERDRAFT/.test(n)) return { tag: 'Personal', reason: 'Bank fee on a mixed account; review.', confidence: 'low', source: 'rules' };
  return { tag: 'Personal', reason: 'No business signal in the merchant name.', confidence: 'low', source: 'rules' };
}

/** Keeps only well-formed AI tags: a known tag and a short one-line reason. */
export function cleanAiTag(t) {
  if (!t || (t.tag !== 'Business' && t.tag !== 'Personal')) return null;
  const reason = String(t.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
  return reason ? { tag: t.tag, reason, confidence: 'high', source: 'ai' } : null;
}

/* ---------- demo file ---------- */

const usdText = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Rebuilds the sample bank file as a messy export: shuffled column order, M/D/YYYY dates, Withdrawals and
 * Deposits columns, a running Balance, a junk Notes column, one unreadable row and one duplicated line.
 */
export function makeMessyDemo(sampleText, start = 10000) {
  const { transactions } = readTransactions(sampleText);
  let bal = start;
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [['Ref #', 'Posted', 'Running Bal.', 'Description', 'Withdrawals', 'Deposits', 'Notes (ignore)'].map(q).join(',')];
  transactions.forEach((t, i) => {
    bal = round2(bal + t.amount);
    const [y, m, d] = t.date.split('-');
    lines.push([`TX${String(i + 1).padStart(4, '0')}`, `${+m}/${+d}/${y}`, usdText(bal), t.name, t.amount < 0 ? usdText(Math.abs(t.amount)) : '', t.amount > 0 ? usdText(t.amount) : '', 'n/a'].map(q).join(','));
  });
  lines.splice(8, 0, ['TX-BAD', 'sometime in March', usdText(bal), 'GARBLED ROW', '', '', 'n/a'].map(q).join(','));
  lines.splice(21, 0, lines[20]); // an exact duplicate of the line above
  return lines.join('\n');
}

export { parseCsv };

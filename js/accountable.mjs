// Accountable-plan reimbursement engine: reads a bank CSV, classifies each transaction against a
// plan (home office, company car, medical) and totals what is reimbursable. Pure functions, no DOM.
// Not tax advice: the plan percentages and rules are inputs, and real plans need a CPA's review.

export const DEFAULT_PLAN = {
  homeOffice: 15, // % of mortgage, water and electric
  companyCar: 80, // % of the company car's insurance
  medical: 100, // % of doctor, dentist and prescription charges
  companyCarInsurers: ['PROGRESSIVE'],
  personalCarInsurers: ['GEICO']
};

/* ---------- CSV ---------- */

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Picks the date, name and amount columns by header. A column called Balance is never the amount. */
export function mapColumns(headers) {
  const find = (...patterns) => {
    for (const p of patterns) {
      const i = headers.findIndex(h => p.test(h.trim()) && !/balance/i.test(h));
      if (i >= 0) return i;
    }
    return -1;
  };
  const warnings = [];
  const mapping = {
    date: find(/^date$/i, /date|posted/i),
    name: find(/^(name|description|payee|merchant)$/i, /desc|name|payee|merchant/i),
    amount: find(/^amount$/i, /amount/i)
  };
  if (headers.some(h => /balance/i.test(h))) warnings.push('A Balance column was found and ignored; it is never used as the amount.');
  for (const [k, v] of Object.entries(mapping)) if (v < 0) warnings.push(`No ${k} column found.`);
  return { mapping, warnings };
}

export function parseAmount(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return NaN;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  const n = Number(s.replace(/[()$,\s-]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(raw) {
  const s = String(raw ?? '').trim();
  if (ISO.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

/** Turns CSV text into transactions. Rows it cannot read are returned in `skipped`, not guessed at. */
export function readTransactions(text) {
  const table = parseCsv(text);
  if (table.length < 2) return { transactions: [], skipped: [], mapping: null, warnings: ['The file has no data rows.'] };
  const { mapping, warnings } = mapColumns(table[0]);
  if (mapping.date < 0 || mapping.name < 0 || mapping.amount < 0) return { transactions: [], skipped: [], mapping, warnings };
  const transactions = [], skipped = [];
  table.slice(1).forEach((r, i) => {
    const date = parseDate(r[mapping.date]);
    const amount = parseAmount(r[mapping.amount]);
    const name = (r[mapping.name] ?? '').trim();
    if (!date || Number.isNaN(amount) || !name) skipped.push({ line: i + 2, raw: r.join(',') });
    else transactions.push({ date, name, amount });
  });
  return { transactions, skipped, mapping, warnings };
}

/* ---------- classification ---------- */

const NOTES = {
  Mortgage: 'Full payment used; real plans usually reimburse interest only.',
  Electric: 'Assumes an electric-only bill; combined gas and electric bills need a split.',
  Prescription: 'Owner medical costs usually run through a separate §105 / HRA arrangement.',
  'Doctor visit': 'Owner medical costs usually run through a separate §105 / HRA arrangement.',
  Dentist: 'Owner medical costs usually run through a separate §105 / HRA arrangement.'
};

const NO = (category, reason) => ({ category, bucket: null, reason });

/** Most specific rules first. Returns { category, bucket, reason } for a debit. */
function matchDebit(name, plan) {
  const n = name.toUpperCase();
  const has = list => list.some(x => n.includes(x.toUpperCase()));

  if (/ANIMAL|VETERIN|\bVCA\b/.test(n)) return NO('Veterinarian', 'Pet care, not human medical.');
  if (/\bRX\b/.test(n)) return { category: 'Prescription', bucket: 'Medical', reason: 'Prescription (RX) charge.' };
  if (/PHARMACY/.test(n)) return NO('Pharmacy front store', 'Same pharmacy without an RX marker: store purchase, not a prescription.');
  if (/DENTAL|DENTIST|SMILES|ORTHODON/.test(n)) return { category: 'Dentist', bucket: 'Medical', reason: 'Dental care.' };
  if (/CLINIC|MEDICAL|\bMED\b|HEALTH|PHYS GRP|PHYSICIAN|REES-STEALY|HOSPITAL|URGENT CARE/.test(n))
    return { category: 'Doctor visit', bucket: 'Medical', reason: 'Doctor or clinic visit.' };

  if (/INS\b|INSURANCE|\bAUTO POL\b/.test(n) && /AUTO|PROGRESSIVE|GEICO|STATE FARM|ALLSTATE|INS /.test(n)) {
    if (has(plan.personalCarInsurers)) return NO('Personal car insurance', "Spouse's or personal car, not the company car.");
    if (has(plan.companyCarInsurers))
      return {
        category: /FEE/.test(n) ? 'Company car insurance fee' : 'Company car insurance',
        bucket: 'Company car',
        reason: /FEE/.test(n) ? 'Policy fee on the company car policy.' : 'Company car insurance.'
      };
    return NO('Car insurance (unassigned)', 'Insurer is not listed as the company car or a personal car; add it to the plan.');
  }

  if (/HOME LOANS|MORTGAGE/.test(n)) return { category: 'Mortgage', bucket: 'Home office', reason: 'Mortgage payment on the home with the office.' };
  if (/SDGE|SDG&E|ELECTRIC|EDISON|PG&E/.test(n)) return { category: 'Electric', bucket: 'Home office', reason: 'Electric utility for the home with the office.' };
  if (/WATER/.test(n)) return { category: 'Water', bucket: 'Home office', reason: 'Water utility for the home with the office.' };

  if (/\bHOA\b/.test(n)) return NO('HOA dues', "Not on the plan's home-office list.");
  if (/COX COMM|INTERNET|COMCAST|SPECTRUM|XFINITY|\bATT\b/.test(n)) return NO('Internet', "Not on the plan's home-office list.");
  if (/TREASURER|PROPERTY TAX|TAX COLLECTOR/.test(n)) return NO('Property tax', "Not on the plan's home-office list.");
  if (/MAINTENANCE FEE|SERVICE FEE|OVERDRAFT/.test(n)) return NO('Bank fee', 'Bank fee.');
  if (/CREDIT CRD|CREDIT CARD|CARD PAYMENT|CARD SERVICES/.test(n)) return NO('Credit card payment', 'Card payment; the underlying charges are unknown.');
  if (/FITNESS|\bGYM\b/.test(n)) return NO('Gym', 'Not a medical expense.');
  if (/RALPHS|TRADER JOE|WHOLE FOODS|VONS|COSTCO|SAFEWAY|ALBERTSONS|KROGER/.test(n)) return NO('Groceries', 'Personal groceries.');
  if (/STARBUCKS|LINKERY|PANERA|CHIPOTLE|IN N OUT|MCDONALD|RESTAURANT|CAFE|COFFEE|PIZZA|BURGER|GRILL/.test(n)) return NO('Dining', 'Dining.');
  if (/TARGET|HOME DEPOT|AMAZON|AMZN|\bREI\b|BEST BUY|WALMART/.test(n)) return NO('Shopping', 'General shopping.');
  return null;
}

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const money = n => '$' + n.toFixed(2);

export function classify(txn, plan = DEFAULT_PLAN) {
  const base = { ...txn, category: 'Uncategorized', bucket: null, eligible: false, pct: 0, reimbursable: 0, reason: 'No rule matched; review this one.', note: '', needsReview: true };

  if (txn.amount > 0) {
    // A waived or refunded fee is a credit, but it is still a bank fee, not income.
    const category = /MAINTENANCE FEE|SERVICE FEE|OVERDRAFT/i.test(txn.name)
      ? 'Bank fee'
      : /CHECK DEPOSIT/i.test(txn.name) ? 'Client payment' : 'Owner draw / income';
    return { ...base, category, reason: 'Money coming in; never reimbursable.', needsReview: false };
  }
  const m = matchDebit(txn.name, plan);
  if (!m) return base;

  const pct = m.bucket === 'Home office' ? plan.homeOffice : m.bucket === 'Company car' ? plan.companyCar : m.bucket === 'Medical' ? plan.medical : 0;
  const eligible = !!m.bucket;
  // With the Mortgage tab's interest for this month, only the interest part of the payment counts.
  const interest = m.category === 'Mortgage' ? plan.mortgageInterest?.[txn.date.slice(0, 7)] : undefined;
  const interestOnly = typeof interest === 'number';
  const basis = interestOnly ? interest : Math.abs(txn.amount);
  return {
    ...base, category: m.category, bucket: m.bucket, eligible, pct, base: basis, interestOnly,
    reason: interestOnly ? `Mortgage interest on the home with the office (${money(interest)} of the ${money(Math.abs(txn.amount))} payment).` : m.reason,
    reimbursable: eligible ? round2((basis * pct) / 100) : 0,
    note: interestOnly ? 'Interest only, from the Mortgage tab.' : NOTES[m.category] ?? '', needsReview: m.category === 'Car insurance (unassigned)'
  };
}

export function classifyAll(transactions, plan = DEFAULT_PLAN) {
  return transactions.map((t, i) => ({ id: i, ...classify(t, plan) }));
}

/** Applies a manual choice to one row: 'Not eligible', a bucket name, or null to keep the automatic result. */
export function applyOverride(row, choice, plan = DEFAULT_PLAN) {
  if (choice == null) return row;
  if (choice === 'Not eligible') return { ...row, bucket: null, eligible: false, pct: 0, reimbursable: 0, reason: 'Marked not eligible by you.', edited: true };
  const pct = choice === 'Home office' ? plan.homeOffice : choice === 'Company car' ? plan.companyCar : plan.medical;
  return {
    ...row, bucket: choice, eligible: row.amount < 0, pct, edited: true, reason: `Marked ${choice} by you.`,
    reimbursable: row.amount < 0 ? round2(((row.base ?? Math.abs(row.amount)) * pct) / 100) : 0
  };
}

export function summarize(rows) {
  const out = { total: 0, eligibleCount: 0, buckets: { 'Home office': 0, 'Company car': 0, Medical: 0 }, needsReview: rows.filter(r => r.needsReview).length };
  for (const r of rows) {
    if (!r.eligible) continue;
    out.eligibleCount++;
    out.total = round2(out.total + r.reimbursable);
    out.buckets[r.bucket] = round2(out.buckets[r.bucket] + r.reimbursable);
  }
  return out;
}

/* ---------- scoring against an answer key ---------- */

/** Compares classified rows to a key CSV (Date, Name, Amount, Category, Plan bucket, Eligible, ..., Reimbursable amount). */
export function scoreAgainstKey(rows, keyText) {
  const table = parseCsv(keyText);
  const h = table[0].map(x => x.trim().toLowerCase());
  const col = name => h.indexOf(name);
  const c = { date: col('date'), name: col('name'), amount: col('amount'), cat: col('category'), bucket: col('plan bucket'), elig: col('eligible'), reimb: col('reimbursable amount') };
  const key = new Map();
  for (const r of table.slice(1)) {
    const k = `${r[c.date]}|${r[c.name]}|${parseAmount(r[c.amount]).toFixed(2)}`;
    const list = key.get(k) ?? [];
    list.push(r);
    key.set(k, list);
  }

  let matched = 0, categoryOk = 0, eligibilityOk = 0, amountOk = 0, missing = 0;
  const mismatches = [];
  for (const row of rows) {
    const list = key.get(`${row.date}|${row.name}|${row.amount.toFixed(2)}`);
    const k = list && list.shift();
    if (!k) { missing++; continue; }
    matched++;
    const wantEligible = k[c.elig] === 'Yes';
    const wantBucket = k[c.bucket] === '-' ? null : k[c.bucket];
    const wantAmount = Number(k[c.reimb] || 0);
    const cat = k[c.cat] === row.category;
    const elig = wantEligible === row.eligible && wantBucket === row.bucket;
    const amt = Math.abs(wantAmount - row.reimbursable) < 0.005;
    if (cat) categoryOk++;
    if (elig) eligibilityOk++;
    if (amt) amountOk++;
    if (!(cat && elig && amt))
      mismatches.push({ date: row.date, name: row.name, expected: `${k[c.cat]} · ${wantBucket ?? 'not eligible'} · $${wantAmount.toFixed(2)}`, got: `${row.category} · ${row.bucket ?? 'not eligible'} · $${row.reimbursable.toFixed(2)}` });
  }
  return { rows: rows.length, matched, missing, categoryOk, eligibilityOk, amountOk, mismatches };
}

/* ---------- export ---------- */

export function toCsv(rows) {
  const esc = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = ['Date', 'Name', 'Amount', 'Category', 'Plan bucket', 'Eligible', 'Business %', 'Reimbursable amount', 'Reason'];
  const lines = rows.map(r => [r.date, r.name, r.amount.toFixed(2), r.category, r.bucket ?? '-', r.eligible ? 'Yes' : 'No', r.eligible ? `${r.pct}%` : '', r.reimbursable.toFixed(2), r.reason].map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}

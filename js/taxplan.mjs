// Quarterly estimated-tax planner. Dates and the safe-harbor rule are the usual federal ones for
// self-employed people, but they change and have exceptions: verify with a CPA or irs.gov before relying on them.
// Pure functions, no DOM. Federal only; state tax is not modelled.

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

/** Moves a date that lands on a weekend to the next weekday (public holidays are not handled). */
export function nextBusinessDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function quarters(taxYear) {
  const y = taxYear;
  return [
    { id: 'Q1', covers: 'Jan 1 – Mar 31', periodStart: `${y}-01`, periodEnd: `${y}-03`, due: nextBusinessDay(`${y}-04-15`) },
    { id: 'Q2', covers: 'Apr 1 – May 31', periodStart: `${y}-04`, periodEnd: `${y}-05`, due: nextBusinessDay(`${y}-06-15`) },
    { id: 'Q3', covers: 'Jun 1 – Aug 31', periodStart: `${y}-06`, periodEnd: `${y}-08`, due: nextBusinessDay(`${y}-09-15`) },
    { id: 'Q4', covers: 'Sep 1 – Dec 31', periodStart: `${y}-09`, periodEnd: `${y}-12`, due: nextBusinessDay(`${y + 1}-01-15`) }
  ];
}

/**
 * What to pay in total across the year to stay inside the usual safe harbor: the smaller of 90% of this year's
 * tax or 100% of last year's (110% when last year's income was above $150,000).
 */
export function requiredAnnual({ currentYearTax, priorYearTax, priorAgiOver150k = false }) {
  const ninety = round2(currentYearTax * 0.9);
  if (!(priorYearTax > 0)) return { amount: ninety, basis: "90% of this year's estimated tax" };
  const prior = round2(priorYearTax * (priorAgiOver150k ? 1.1 : 1));
  return prior < ninety
    ? { amount: prior, basis: `${priorAgiOver150k ? '110' : '100'}% of last year's tax` }
    : { amount: ninety, basis: "90% of this year's estimated tax" };
}

/**
 * Four payment rows: the amount due, what should be set aside by then, and what the set-aside rate has built from
 * the income in `monthly` ({ months: ['YYYY-MM'], income: number[] }). `status` explains whether it is enough.
 */
export function schedule({ taxYear, required, taxRate, monthly, today }) {
  const perQuarter = round2(required / 4);
  const first = monthly.months[0];
  const last = monthly.months[monthly.months.length - 1];
  return quarters(taxYear).map((q, i) => {
    const cumulativeRequired = round2(perQuarter * (i + 1));
    const income = monthly.months.reduce(
      (s, m, k) => (m.startsWith(String(taxYear)) && m <= q.periodEnd ? s + monthly.income[k] : s), 0);
    const setAside = round2(income * taxRate);
    const dataCovers = first <= q.periodStart && last >= q.periodEnd;
    const gap = round2(Math.max(0, cumulativeRequired - setAside));
    const past = today > q.due;
    const status = !dataCovers ? 'No data yet' : gap === 0 ? (past ? 'Covered' : 'On track') : (past ? 'Short' : 'Behind');
    return { ...q, amountDue: perQuarter, cumulativeRequired, setAside, gap, status };
  });
}

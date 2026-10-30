// One summary of "the books" computed from the shared transactions, used by Home, the tax planner and the report
// so they always agree. Pure functions, no DOM.
import { classifyAll, summarize as planSummary, DEFAULT_PLAN } from './accountable.mjs';
import { incomeByMonth, maxSafePaycheck, simulate, summarize as potSummary, suggestRate, swing } from './paycheck.mjs';
import { estimateTax } from './engine.mjs';
import TAX from './tax2025.mjs';
import { tagLocal, merchantKey } from './importer.mjs';
import { requiredAnnual, schedule } from './taxplan.mjs';
import { projectPot } from './forecast.mjs';
import { describe } from './dataset.mjs';

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const INCOME = new Set(['Owner draw / income', 'Client payment']);

/** Rule-based tag, overridden by anything the user taught the app for that merchant. */
export function tagFor(txn, learned = {}) {
  const hit = learned[merchantKey(txn.name)];
  return hit ? { tag: hit, reason: 'Learned from your correction.', confidence: 'high', source: 'you' } : tagLocal(txn);
}

export function summarizeBooks(txns, { learned = {}, plan = DEFAULT_PLAN, today = new Date().toISOString().slice(0, 10), priorYearTax = 0 } = {}) {
  const span = describe(txns);
  if (!txns.length) return { empty: true, span };

  const classified = classifyAll(txns, plan);
  const incomeRows = classified.filter(r => INCOME.has(r.category));
  const monthly = incomeByMonth(incomeRows, classified.map(r => r.date));
  const totalIncome = round2(incomeRows.reduce((s, r) => s + r.amount, 0));
  const totalSpending = round2(txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0));

  const annual = monthly.months.length ? (totalIncome / monthly.months.length) * 12 : 0;
  const estimate = estimateTax({ filingStatus: 'single', wages: 0, selfEmployment: Math.round(annual), withholding: null }, TAX);
  const rate = suggestRate(estimate.total, annual);
  const recommended = maxSafePaycheck({ income: monthly.income, taxRate: rate });
  const sim = simulate({ income: monthly.income, paycheck: recommended, taxRate: rate });
  const pot = potSummary(sim, recommended);
  const forecast = projectPot({ history: monthly.income, paycheck: recommended, taxRate: rate, startPot: sim.length ? sim[sim.length - 1].pot : 0 });

  const tags = txns.map(t => ({ t, info: tagFor(t, learned) }));
  const expenses = tags.filter(x => x.t.amount < 0);
  const business = round2(expenses.filter(x => x.info.tag === 'Business').reduce((s, x) => s + Math.abs(x.t.amount), 0));
  const personal = round2(expenses.filter(x => x.info.tag === 'Personal').reduce((s, x) => s + Math.abs(x.t.amount), 0));
  const needsReview = tags.filter(x => x.info.confidence === 'low').length;

  const taxYear = Number(span.last.slice(0, 4));
  const required = requiredAnnual({ currentYearTax: estimate.total, priorYearTax });
  const quarterly = schedule({ taxYear, required: required.amount, taxRate: rate, monthly, today });

  return {
    empty: false, span, monthly, totalIncome, totalSpending, incomeSwing: swing(monthly.income),
    estimate, rate, recommended, pot, sim, forecast,
    tags: { business, personal, needsReview },
    plan: planSummary(classified), planRows: classified,
    tax: { taxYear, required, quarterly }
  };
}

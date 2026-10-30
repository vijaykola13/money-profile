// A three-month look ahead for the holding pot: one path if income continues at its recent average and one
// "lean" path if it falls to its recent low. Based on past deposits only, so it is a planning aid, not a prediction.
import { simulate } from './paycheck.mjs';

const mean = xs => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);

export function projectPot({ history, paycheck, taxRate, startPot = 0, months = 3 }) {
  const recent = history.slice(-3);
  const expectedIncome = Math.round(mean(recent));
  const leanIncome = recent.length ? Math.min(...recent) : 0;
  const run = income => simulate({ income: Array(months).fill(income), paycheck, taxRate, startPot });
  return { expectedIncome, leanIncome, expected: run(expectedIncome), lean: run(leanIncome) };
}

import type { Model } from "@/lib/model";
import { Card, usd } from "./ui";

/** Catmull-Rom through the points, written as cubic bezier (C) segments for a smooth curve. */
export function smooth(P: [number, number][]) {
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] ?? P[i];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[i + 2] ?? p2;
    const k = 0.17;
    d += `C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} ${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** A tidy step so the five gridlines land on round numbers. */
function niceStep(max: number) {
  const raw = Math.max(max, 1) / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
}

const short = (v: number) => (v >= 1000 ? `$${v / 1000 % 1 ? (v / 1000).toFixed(1) : v / 1000}k` : `$${v}`);

export function IncomeChart({ model }: { model: Model }) {
  const { labels, profit, loss } = model.chart;
  const step = niceStep(Math.max(...profit, ...loss));
  const top = step * 5;
  const ticks = [5, 4, 3, 2, 1].map((i) => i * step);

  const n = labels.length;
  const x = (i: number) => 4 + (i * 92) / (n - 1);
  const y = (v: number) => 100 - (v / top) * 100;
  const pts = (xs: number[]) => xs.map((v, i) => [x(i), y(v)] as [number, number]);
  const profitPts = pts(profit);
  const lossPts = pts(loss);

  return (
    <Card className="lg:col-span-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">Total Income</h3>
          <p className="mt-0.5 text-sm font-medium text-gray-500">
            {model.live ? "Income against spending, linked bank" : "Income against spending, Jan–Aug"}
          </p>
        </div>
        <div className="flex gap-4 text-sm font-medium text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-brand-blue" /> Profit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-zinc-950" /> Loss
          </span>
        </div>
      </div>

      <div className="mt-6 flex">
        <div className="relative mr-3 h-60 w-10 shrink-0 text-right text-[10px] text-gray-400" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(t)}%` }}>
              {short(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-60">
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-gray-100" style={{ top: `${y(t)}%` }} />
            ))}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
              role="img"
              aria-label="Profit and loss by period"
            >
              <path d={smooth(profitPts)} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path
                d={smooth(lossPts)}
                fill="none"
                stroke="#18181b"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="4 2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {[
              { pts: profitPts, vals: profit, color: "#3b82f6", name: "Profit" },
              { pts: lossPts, vals: loss, color: "#18181b", name: "Loss" },
            ].flatMap(({ pts: P, vals, color, name }) =>
              P.map(([px, py], i) => (
                <button
                  type="button"
                  key={`${name}-${i}`}
                  aria-label={`${name} ${labels[i]}: ${usd(vals[i])}`}
                  title={`${name}, ${labels[i]}: ${usd(vals[i])}`}
                  className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-transform hover:scale-150 focus-visible:scale-150 focus-visible:outline-2 focus-visible:outline-brand"
                  style={{ left: `${px}%`, top: `${py}%`, backgroundColor: color }}
                />
              )),
            )}
          </div>

          <div className="relative mt-2 h-4 text-[10px] text-gray-400" aria-hidden="true">
            {labels.map((l, i) => (
              <span key={l + i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${x(i)}%` }}>
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

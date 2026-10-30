import * as React from "react";
import { smooth } from "@/components/dashboard/income-chart";
import { usd } from "@/components/dashboard/ui";

export const PALETTE = ["#FF6B35", "#3B82F6", "#10B981", "#8B5CF6", "#EC4899", "#F59E0B", "#14B8A6", "#64748B"];

/** True one frame after mount, so bars and rings can animate in from zero. */
function useReady() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return ready;
}

/** A tidy step so five gridlines land on round numbers. */
function niceStep(max: number) {
  const raw = Math.max(max, 1) / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
}
const short = (v: number) => (v >= 1000 ? `$${Number.isInteger(v / 1000) ? v / 1000 : (v / 1000).toFixed(1)}k` : `$${v}`);

/** A small smooth line with a soft fill, for the corner of a card. */
export function Sparkline({ values, color = "#FF6B35", height = 44 }: { values: number[]; color?: string; height?: number }) {
  const id = React.useId();
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 100 - ((v - lo) / span) * 86 - 7] as [number, number]);
  const d = smooth(pts);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} className="w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L100,100L0,100Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface Slice {
  label: string;
  value: number;
  color?: string;
}

/** A ring split into slices, with a legend. The centre shows a headline figure. */
export function Donut({
  slices,
  centerTop,
  centerBottom,
  size = 168,
  thickness = 20,
  format = (n: number) => usd(n),
}: {
  slices: Slice[];
  centerTop?: string;
  centerBottom?: string;
  size?: number;
  thickness?: number;
  format?: (n: number) => string;
}) {
  const ready = useReady();
  const items = slices.filter((s) => s.value > 0);
  const total = items.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const gap = items.length > 1 ? 3 : 0;
  let acc = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Split: ${items.map((s) => `${s.label} ${format(s.value)}`).join(", ")}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={thickness} className="text-gray-100" />
          {total > 0 &&
            items.map((s, i) => {
              const len = Math.max(0, (s.value / total) * C - gap);
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color ?? PALETTE[i % PALETTE.length]}
                  strokeWidth={thickness}
                  strokeLinecap="butt"
                  strokeDasharray={`${ready ? len : 0} ${C}`}
                  strokeDashoffset={-acc}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.2,0.8,0.2,1)" }}
                />
              );
              acc += (s.value / total) * C;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          {centerTop && <span className="text-2xl font-bold tracking-tight text-ink">{centerTop}</span>}
          {centerBottom && <span className="text-xs font-medium text-gray-500">{centerBottom}</span>}
        </div>
      </div>
      <ul className="min-w-[150px] flex-1 space-y-2 text-sm font-medium">
        {items.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-gray-500">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color ?? PALETTE[i % PALETTE.length] }} /> {s.label}
            </span>
            <span className="font-semibold text-ink">
              {format(s.value)} <span className="text-xs font-medium text-gray-400">{total ? Math.round((s.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
        {!items.length && <li className="text-gray-400">Nothing to show yet.</li>}
      </ul>
    </div>
  );
}

/** Vertical bars with five gridlines, and an optional line over them (a flat target or a series). */
export function BarsLine({
  labels,
  bars,
  barLabel = "Amount",
  line,
  lineLabel = "Target",
  color = "#FF6B35",
  lineColor = "#3B82F6",
  height = 240,
}: {
  labels: string[];
  bars: number[];
  barLabel?: string;
  line?: number | number[];
  lineLabel?: string;
  color?: string;
  lineColor?: string;
  height?: number;
}) {
  const lineMax = line === undefined ? 0 : Array.isArray(line) ? Math.max(...line) : line;
  const step = niceStep(Math.max(...bars, lineMax, 1));
  const top = step * 5;
  const ticks = [5, 4, 3, 2, 1].map((i) => i * step);
  const y = (v: number) => 100 - (Math.max(0, v) / top) * 100;
  const n = bars.length;
  const lineSeries = Array.isArray(line) ? line : undefined;

  return (
    <div>
      <div className="flex">
        <div className="relative mr-3 w-10 shrink-0 text-right text-[10px] text-gray-400" style={{ height }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(t)}%` }}>{short(t)}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-gray-100" style={{ top: `${y(t)}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[3%] px-[1%]">
              {bars.map((v, i) => (
                <div key={i} className="group relative flex h-full flex-1 items-end" title={`${labels[i]}: ${usd(v)}`}>
                  <div
                    className="bar-grow w-full rounded-t-lg transition-opacity group-hover:opacity-80"
                    style={{ height: `${(Math.max(0, v) / top) * 100}%`, background: `linear-gradient(180deg, ${color}, ${color}99)`, animationDelay: `${i * 45}ms` }}
                  />
                </div>
              ))}
            </div>
            {typeof line === "number" && (
              <div className="absolute inset-x-0 border-t-2 border-dashed" style={{ top: `${y(line)}%`, borderColor: lineColor }} />
            )}
            {lineSeries && lineSeries.length > 1 && (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
                <path
                  d={smooth(lineSeries.map((v, i) => [((i + 0.5) / n) * 100, y(v)] as [number, number]))}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
          </div>
          <div className="mt-2 flex gap-[3%] px-[1%] text-[10px] text-gray-400" aria-hidden="true">
            {labels.map((l, i) => (
              <span key={i} className="flex-1 truncate text-center">{l}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 flex flex-wrap gap-4 text-xs font-medium text-gray-500">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ backgroundColor: color }} /> {barLabel}</span>
        {line !== undefined && (
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ backgroundColor: lineColor }} /> {lineLabel}</span>
        )}
      </p>
    </div>
  );
}

/** Horizontal bars for ranking things, such as spending by category. */
export function HBars({ rows, format = (n: number) => usd(n) }: { rows: { label: string; value: number; color?: string }[]; format?: (n: number) => string }) {
  const ready = useReady();
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between text-sm font-medium">
            <span className="truncate text-ink">{r.label}</span>
            <span className="shrink-0 pl-3 font-semibold text-ink">{format(r.value)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full"
              style={{
                width: ready ? `${(r.value / max) * 100}%` : "0%",
                backgroundColor: r.color ?? PALETTE[i % PALETTE.length],
                transition: `width 0.8s cubic-bezier(0.2,0.8,0.2,1) ${i * 60}ms`,
              }}
            />
          </div>
        </li>
      ))}
      {!rows.length && <li className="text-sm font-medium text-gray-400">Nothing to show yet.</li>}
    </ul>
  );
}

/** A thick progress bar with the diagonal stripe from the design. */
export function ProgressBar({ value, max, tone = "#FF6B35", label }: { value: number; max: number; tone?: string; label?: string }) {
  const ready = useReady();
  const share = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="h-3 overflow-hidden rounded-full bg-gray-100"
      role="progressbar"
      aria-valuenow={Math.round(share)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="progress-stripe h-full rounded-full transition-[width] duration-700" style={{ width: ready ? `${share}%` : "0%", backgroundColor: tone }} />
    </div>
  );
}

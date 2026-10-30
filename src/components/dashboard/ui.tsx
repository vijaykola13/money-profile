import * as React from "react";

export const usd = (n: number, dec = 0) =>
  (n < 0 ? "−" : "") +
  "$" +
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const pct = (n: number, dec = 1) => n.toFixed(dec) + "%";

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-[32px] bg-white p-6 shadow-card ${className}`}>{children}</section>;
}

export function CardTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-ink">{children}</h3>
      {hint && <p className="mt-0.5 text-sm font-medium text-gray-500">{hint}</p>}
    </div>
  );
}

export function Flag({ code, size = 24 }: { code: "USD" | "EUR" | "GBP"; size?: number }) {
  const id = `flag-${code}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <clipPath id={id}>
        <circle cx="12" cy="12" r="12" />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        {code === "USD" && (
          <>
            <rect width="24" height="24" fill="#fff" />
            {[0, 2, 4, 6, 8, 10, 12].map((i) => (
              <rect key={i} y={i * 1.85} width="24" height="1.85" fill="#e11d48" />
            ))}
            <rect width="11" height="13" fill="#1d4ed8" />
          </>
        )}
        {code === "EUR" && (
          <>
            <rect width="24" height="24" fill="#1d4ed8" />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return <circle key={i} cx={12 + 6 * Math.cos(a)} cy={12 + 6 * Math.sin(a)} r="1.3" fill="#facc15" />;
            })}
          </>
        )}
        {code === "GBP" && (
          <>
            <rect width="24" height="24" fill="#1e3a8a" />
            <path d="M0 0L24 24M24 0L0 24" stroke="#fff" strokeWidth="4" />
            <path d="M0 0L24 24M24 0L0 24" stroke="#e11d48" strokeWidth="1.5" />
            <path d="M12 0V24M0 12H24" stroke="#fff" strokeWidth="6" />
            <path d="M12 0V24M0 12H24" stroke="#e11d48" strokeWidth="3.5" />
          </>
        )}
      </g>
    </svg>
  );
}

export function StatusPill({ status }: { status: "Completed" | "Pending" | "In Progress" }) {
  const tone = {
    Completed: "bg-emerald-50 text-emerald-600",
    Pending: "bg-red-50 text-red-500",
    "In Progress": "bg-orange-50 text-brand",
  }[status];
  const dot = { Completed: "bg-emerald-500", Pending: "bg-red-500", "In Progress": "bg-brand" }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

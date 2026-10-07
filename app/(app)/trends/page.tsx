import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import type { Trends } from "@/lib/trends";
import { loadTrends } from "@/lib/views";
import TrendsChart from "./TrendsChart";

export const metadata: Metadata = { title: "Trends" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string, withYear = true) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}${withYear ? ` ${ym.slice(0, 4)}` : ""}`;
const money = (n: number | null) => (n === null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const lastYearOf = (ym: string) => `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`;

/** One sentence for the canvas's text alternative: the latest month on record, type by type. */
function summarize(t: Trends): string {
  for (let i = t.months.length - 1; i >= 0; i--) {
    const parts = t.series.filter((s) => s.values[i] !== null).map((s) => `${s.label} ${money(s.values[i])}`);
    if (parts.length) return `Monthly cost per bill type over ${t.months.length} months. ${monthName(t.months[i])}: ${parts.join(", ")}.`;
  }
  return "Monthly cost per bill type. No bills in this window.";
}

// Trends (feature_trends): each bill type's cost by statement month, the last 12 months against
// the year before, then totals in words and figures. The CSV has the whole history.
export default async function TrendsPage() {
  const ctx = await requireUser();
  requireFeature(ctx, "trends");
  const t = await loadTrends(ctx);
  const total = (k: "yearToDate" | "sameMonthLastYear" | "allTime") => {
    const vals = t.totals.map((r) => r[k]).filter((v): v is number => v !== null);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v * 100, 0)) / 100 : null;
  };
  // A household younger than a year has no "same month last year"; the column would be all dashes.
  const columns = [
    { key: "yearToDate" as const, label: `${t.year} so far`, cell: "cell-ytd" },
    ...(t.totals.some((r) => r.sameMonthLastYear !== null)
      ? [{ key: "sameMonthLastYear" as const, label: `${monthName(lastYearOf(t.thisMonth))}`, cell: "cell-last" }]
      : []),
    { key: "allTime" as const, label: t.since ? `Since ${monthName(t.since)}` : "All time", cell: "cell-all" },
  ];

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Trends</h1>
          <p className="text-sm text-ink-muted">What each bill cost, month by month, by statement date.</p>
        </div>
        {t.since && (
          <a href="/trends/csv" className="btn btn-sm" download>
            Download CSV
          </a>
        )}
      </div>

      {!t.since ? (
        <div className="panel px-5 py-8 text-center">
          <p className="display text-lg font-semibold">Nothing to chart yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Once bills are posted, each type&apos;s monthly cost shows up here.{" "}
            {ctx.membership.role === "admin" && !ctx.demo && (
              <Link href="/portal" className="text-accent underline underline-offset-2">
                Post a bill
              </Link>
            )}
          </p>
        </div>
      ) : (
        <>
          <section className="panel mb-8 p-4 sm:p-5" aria-label="Monthly cost per bill type">
            <TrendsChart months={t.months} series={t.series} summary={summarize(t)} />
          </section>

          <section>
            <div className="mb-2 flex items-center gap-3">
              <h2 className="eyebrow">Totals by bill type</h2>
              <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
            </div>
            <div className="panel">
              <table className="data-table table-stack table-stack-trends">
                <thead>
                  <tr>
                    <th>Bill type</th>
                    {columns.map((c) => (
                      <th key={c.key} className="num">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.totals.map((r) => (
                    <tr key={r.key}>
                      <td className="cell-type font-medium">
                        {r.emoji ? `${r.emoji} ` : ""}
                        {r.label}
                      </td>
                      {columns.map((c) => (
                        <td key={c.key} className={`num ${c.cell}`}>
                          <span className="eyebrow trend-label sm:hidden">{c.label}</span>
                          <span className={`figure ${r[c.key] === null ? "text-ink-muted" : ""}`}>{money(r[c.key])}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="cell-type">Total</td>
                    {columns.map((c) => (
                      <td key={c.key} className={`num ${c.cell}`}>
                        <span className="eyebrow trend-label sm:hidden">{c.label}</span>
                        <span className="figure">{money(total(c.key))}</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              A dash means no bill of that type was posted then. Amounts are whole bills, before they&apos;re split.
            </p>
          </section>
        </>
      )}
    </main>
  );
}

import type { Tx } from "@/lib/db";
import { SERIES_SLOTS } from "@/lib/theme-tokens";

// Trends (feature_trends): what each bill type cost, month by month, by statement date. Ported
// from utilities, which hard-coded Gas and Electric; here every type is a series. Colors follow
// the type, never its rank: types take the theme's series slots in the order they were created,
// and a sixth type onward folds into "Other" (DESIGN.md, Colors > Data series).

export interface MonthTotal {
  month: string; // YYYY-MM
  typeId: number;
  total: number;
}

export interface TrendType {
  id: number;
  name: string;
  emoji: string;
}

export interface Series {
  key: string; // "t{typeId}" or "other"
  label: string;
  emoji: string;
  /** 1..SERIES_SLOTS, or null for "Other" (muted ink). */
  slot: number | null;
  /** Per month in `months`; null means no bill that month (a gap, never a $0 statement). */
  values: (number | null)[];
  /** The same months a year earlier. */
  lastYear: (number | null)[];
}

export interface TotalsRow {
  key: string;
  label: string;
  emoji: string;
  slot: number | null;
  yearToDate: number | null;
  sameMonthLastYear: number | null;
  allTime: number | null;
}

export interface Trends {
  /** The chart window: up to 12 consecutive months ending this month, YYYY-MM. */
  months: string[];
  series: Series[];
  totals: TotalsRow[];
  /** The first month on record, YYYY-MM, or null with no bills. */
  since: string | null;
  year: string;
  thisMonth: string;
}

const cents = (n: number) => Math.round(n * 100) / 100;

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Every bill's total, summed per type per statement month. */
export function monthTotals(tx: Tx): Promise<MonthTotal[]> {
  return tx<MonthTotal[]>`
    SELECT to_char(bill_date, 'YYYY-MM') AS month, type_id AS "typeId", SUM(total) AS total
    FROM bills GROUP BY 1, 2 ORDER BY 1, 2`;
}

export function trendTypes(tx: Tx): Promise<TrendType[]> {
  return tx<TrendType[]>`SELECT id, name, emoji FROM bill_types ORDER BY id`;
}

/** The chart, the totals table and the CSV all come from here; `today` is the household's date. */
export function buildTrends(rows: MonthTotal[], types: TrendType[], today: string): Trends {
  const thisMonth = today.slice(0, 7);
  const year = today.slice(0, 4);
  const since = rows.length ? rows.reduce((min, r) => (r.month < min ? r.month : min), rows[0].month) : null;

  // Up to 12 months ending this month, but never before the first bill.
  let start = addMonths(thisMonth, -11);
  if (since && since > start) start = since;
  const months: string[] = [];
  for (let m = start; m <= thisMonth; m = addMonths(m, 1)) months.push(m);

  // Types without a bill still get a slot (assignment is by creation order, not by data).
  const slotted = types.slice(0, SERIES_SLOTS);
  const folded = new Set(types.slice(SERIES_SLOTS).map((t) => t.id));
  const groups: { key: string; label: string; emoji: string; slot: number | null; ids: Set<number> }[] = [
    ...slotted.map((t, i) => ({ key: `t${t.id}`, label: t.name, emoji: t.emoji, slot: i + 1, ids: new Set([t.id]) })),
    ...(folded.size ? [{ key: "other", label: "Other", emoji: "", slot: null, ids: folded }] : []),
  ];

  const byMonth = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const m = byMonth.get(r.month) ?? new Map<number, number>();
    m.set(r.typeId, (m.get(r.typeId) ?? 0) + r.total);
    byMonth.set(r.month, m);
  }
  const value = (month: string, ids: Set<number>): number | null => {
    const m = byMonth.get(month);
    if (!m) return null;
    let sum: number | null = null;
    for (const id of ids) if (m.has(id)) sum = (sum ?? 0) + m.get(id)!;
    return sum === null ? null : cents(sum);
  };
  const sum = (ids: Set<number>, keep: (month: string) => boolean): number | null => {
    let s: number | null = null;
    for (const r of rows) if (ids.has(r.typeId) && keep(r.month)) s = (s ?? 0) + r.total;
    return s === null ? null : cents(s);
  };
  const lastYearMonth = addMonths(thisMonth, -12);

  return {
    months,
    series: groups.map((g) => ({
      key: g.key,
      label: g.label,
      emoji: g.emoji,
      slot: g.slot,
      values: months.map((m) => value(m, g.ids)),
      lastYear: months.map((m) => value(addMonths(m, -12), g.ids)),
    })),
    totals: groups.map((g) => ({
      key: g.key,
      label: g.label,
      emoji: g.emoji,
      slot: g.slot,
      yearToDate: sum(g.ids, (m) => m.startsWith(year)),
      sameMonthLastYear: value(lastYearMonth, g.ids),
      allTime: sum(g.ids, () => true),
    })),
    since,
    year,
    thisMonth,
  };
}

/** Full history as CSV: one row per month on record, one column per bill type (none folded). */
export function trendsCsv(rows: MonthTotal[], types: TrendType[]): string {
  // Quote what needs quoting, and defuse names a spreadsheet would run as a formula.
  const field = (raw: string) => {
    const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  };
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const at = new Map(rows.map((r) => [`${r.month}:${r.typeId}`, r.total]));
  const lines = [["Month", ...types.map((t) => t.name), "Total"].map(field).join(",")];
  for (const m of months) {
    const cells = types.map((t) => at.get(`${m}:${t.id}`));
    const total = cents(cells.reduce<number>((s, v) => s + (v ?? 0), 0));
    lines.push([m, ...cells.map((v) => (v === undefined ? "" : v.toFixed(2))), total.toFixed(2)].join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

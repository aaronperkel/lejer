// Calendar dates in a household's timezone. Bill and due dates are plain YYYY-MM-DD; "today"
// must be the household's today, not the server's (Vercel runs UTC, where a late evening in
// New York is already tomorrow).

/** YYYY-MM-DD in the given IANA zone. */
export function localDate(timezone: string, at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

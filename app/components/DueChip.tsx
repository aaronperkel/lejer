import { daysBetween } from "@/lib/time";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function dayMonth(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Due-date chip, counted in the household's own calendar (`today` is its localDate) and amber
 * inside its urgent window (urgent_reminder_days), the same rules the reminder emails use. Red
 * once past due. Screen readers get the whole sentence rather than the "3d" shorthand.
 */
export default function DueChip({ due, paid, today, urgentDays }: { due: string; paid: boolean; today: string; urgentDays: number }) {
  const date = dayMonth(due);
  const days = daysBetween(today, due);
  const [label, spoken, cls] = paid
    ? [date, `Due ${date}, paid`, "due-paid"]
    : days < 0
      ? [`${date} • Past due ${-days}d`, `Due ${date}, past due by ${plural(-days, "day")}`, "due-past"]
      : days === 0
        ? [`${date} • Due today`, `Due today, ${date}`, "due-soon"]
        : [`${date} • Due in ${days}d`, `Due ${date}, in ${plural(days, "day")}`, days <= urgentDays ? "due-soon" : "due-future"];
  return (
    <span className={`due-chip ${cls}`}>
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

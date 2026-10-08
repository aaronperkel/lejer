// Plain-words schedule copy, shared by the settings form (live, as numbers change) and the
// read-only view. The cadence itself lives in lib/reminders.ts; this only describes it.

/** 0 → "12:00 AM", 13 → "1:00 PM". */
export function hourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** "A heads-up 7 days before a bill is due, then a reminder every day from 3 days before …" */
export function scheduleSentence(p: { first: string | number; urgent: string | number; hour: string | number; overdueEvery: number }): string {
  const first = Number(p.first);
  const urgent = Number(p.urgent);
  const hour = Number(p.hour);
  if (!Number.isInteger(first) || !Number.isInteger(urgent) || first < 1 || urgent < 0 || urgent >= first) {
    return "Daily reminders have to start after the heads-up.";
  }
  const daily = urgent === 0 ? "a reminder on the due date" : `a reminder every day from ${days(urgent)} before through the due date`;
  return `Anyone who still owes gets a heads-up ${days(first)} before a bill is due, then ${daily}. Once it's late, one every ${days(p.overdueEvery)} until it's paid. Each goes out around ${hourLabel(hour)}.`;
}

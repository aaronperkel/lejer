import type { Ctx } from "@/lib/context";
import type { Bill, BillType, Debt, Person } from "@/lib/bills";
import type { Household } from "@/lib/types";

// The /demo household: in memory, ledger mode, no database. getCtx() returns demoCtx() for a
// visitor holding the demo cookie; data functions branch on ctx.demo and mutations
// refuse with DEMO_REFUSAL. Dates are relative to today so the demo never looks stale.
// Ported from peach-cob's lib/demo.ts with neutral names.

export const DEMO_REFUSAL = "The demo is read-only. Sign in to run your own household.";

/** YYYY-MM-DD for today + offsetDays. */
function ymd(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export interface DemoPerson {
  id: number; // membership id
  name: string;
  email: string;
  role: "admin" | "member";
  splitsBills: boolean;
}

export const DEMO_PEOPLE: DemoPerson[] = [
  { id: 1, name: "Robin", email: "robin@example.com", role: "admin", splitsBills: true },
  { id: 2, name: "Jordan", email: "jordan@example.com", role: "member", splitsBills: true },
  { id: 3, name: "Casey", email: "casey@example.com", role: "member", splitsBills: true },
  { id: 4, name: "Morgan", email: "morgan@example.com", role: "member", splitsBills: true },
  { id: 5, name: "Kit", email: "kit@example.com", role: "admin", splitsBills: false },
];

/** Who the demo visitor is signed in as. */
export const DEMO_VIEWER = DEMO_PEOPLE[0];

export const DEMO_BILL_TYPES: BillType[] = [
  { id: 1, name: "Electric", emoji: "⚡", processingFee: 0, ownerId: 2, ownerName: "Jordan" },
  { id: 2, name: "Gas", emoji: "🔥", processingFee: 0, ownerId: 3, ownerName: "Casey" },
  { id: 3, name: "Water", emoji: "💧", processingFee: 0, ownerId: 4, ownerName: "Morgan" },
  { id: 4, name: "Wifi", emoji: "🛜", processingFee: 0, ownerId: 1, ownerName: "Robin" },
];

const bill = (id: number, typeId: number, billOffset: number, dueOffset: number, total: number, perPersonCost: number): Bill => {
  const t = DEMO_BILL_TYPES.find((x) => x.id === typeId)!;
  return {
    id, typeId, typeName: t.name, typeEmoji: t.emoji, ownerId: t.ownerId, ownerName: t.ownerName,
    billDate: ymd(billOffset), dueDate: ymd(dueOffset), total, perPersonCost,
    status: "unpaid", pdfPath: null, addedByName: t.ownerName,
  };
};

const BILLS: Bill[] = [
  bill(1, 2, -11, 5, 62.4, 15.6),
  bill(2, 4, -12, 12, 79.99, 20.0),
  bill(3, 3, -3, 19, 43.16, 10.79),
  bill(4, 1, -38, -23, 104.12, 26.03),
];

/** billId → membership ids who have paid back (everyone else in the fixed debtor set owes). */
const PAID = new Map<number, number[]>([
  [1, [2]],
  [2, [2]],
  [3, []],
  [4, [1, 3, 4]],
]);

const SPLITTERS = DEMO_PEOPLE.filter((p) => p.splitsBills);

/** Each bill's fixed debtor set: every splitter except the type's owner. */
export function demoDebts(billId: number): Debt[] {
  const b = BILLS.find((x) => x.id === billId)!;
  return SPLITTERS.filter((p) => p.id !== b.ownerId).map((p) => ({ personId: p.id, name: p.name, paid: PAID.get(billId)!.includes(p.id) }));
}

export const DEMO_BILLS: Bill[] = BILLS.map((b) => ({ ...b, status: demoDebts(b.id).every((d) => d.paid) ? "paid" : "unpaid" }));

export const DEMO_SPLITTERS: Person[] = SPLITTERS.map(({ id, name }) => ({ id, name }));

const DEMO_HOUSEHOLD: Household = {
  id: -1, // never a database id; withHousehold refuses demo scopes anyway
  slug: "demo",
  name: "Demo House",
  tagline: "Who owes whom",
  mode: "ledger",
  theme: "peach",
  colorScheme: "light",
  timezone: "America/New_York",
  askBillDate: false,
  billsPerPage: 10,
  featureRent: false,
  featureTrends: true,
  featureBulkEmail: false,
  featureDocuments: false,
  featureWelcomeTour: true,
  featureThanks: true,
  monthlyRent: null,
  leaseStart: null,
  leaseEnd: null,
  remindersEnabled: true,
  sendHour: 9,
  firstReminderDays: 7,
  urgentReminderDays: 3,
  fromName: null,
  replyTo: null,
  digestEmail: null,
};

export function demoCtx(): Ctx {
  return {
    user: { id: -1, email: DEMO_VIEWER.email, name: DEMO_VIEWER.name },
    membership: {
      id: DEMO_VIEWER.id,
      householdId: DEMO_HOUSEHOLD.id,
      userId: -1,
      role: DEMO_VIEWER.role,
      splitsBills: DEMO_VIEWER.splitsBills,
      welcomedAt: new Date(),
      joinedAt: new Date(),
    },
    household: DEMO_HOUSEHOLD,
    demo: true,
  };
}

/**
 * A year and a bit of history for the demo's trends chart (the bill list above stays short).
 * Deterministic: a seasonal curve per type, so gas peaks in winter and electric in summer.
 */
export function demoMonthTotals(today: string): { month: string; typeId: number; total: number }[] {
  const [y, m] = today.split("-").map(Number);
  const out: { month: string; typeId: number; total: number }[] = [];
  for (let back = 14; back >= 1; back--) {
    const d = new Date(Date.UTC(y, m - 1 - back, 1));
    const month = d.toISOString().slice(0, 7);
    const season = Math.cos(((d.getUTCMonth() + 0.5) / 12) * 2 * Math.PI); // +1 in January, -1 in July
    const wobble = ((back * 37) % 11) / 10 - 0.5;
    out.push({ month, typeId: 1, total: Math.round((88 - season * 26 + wobble * 9) * 100) / 100 }); // Electric
    out.push({ month, typeId: 2, total: Math.round((52 + season * 34 + wobble * 6) * 100) / 100 }); // Gas
    out.push({ month, typeId: 3, total: Math.round((41 + wobble * 4) * 100) / 100 }); // Water
    out.push({ month, typeId: 4, total: 79.99 }); // Wifi
  }
  // The posted demo bills stand in for the history in their own months.
  const posted = BILLS.map((b) => ({ month: b.billDate.slice(0, 7), typeId: b.typeId, total: b.total }));
  return [...out.filter((h) => !posted.some((p) => p.month === h.month && p.typeId === h.typeId)), ...posted];
}

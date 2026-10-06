import type { Ctx } from "@/lib/context";
import type { Household } from "@/lib/types";

// The /demo household: in memory, ledger mode, no database. getCtx() returns demoCtx() for a
// visitor holding the lejer_demo cookie; data functions branch on ctx.demo and mutations
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

export const DEMO_BILL_TYPES = [
  { id: 1, name: "Electric", emoji: "⚡", processingFee: 0, ownerId: 2, ownerName: "Jordan" },
  { id: 2, name: "Gas", emoji: "🔥", processingFee: 0, ownerId: 3, ownerName: "Casey" },
  { id: 3, name: "Water", emoji: "💧", processingFee: 0, ownerId: 4, ownerName: "Morgan" },
  { id: 4, name: "Wifi", emoji: "🛜", processingFee: 0, ownerId: 1, ownerName: "Robin" },
];

export const DEMO_BILLS = [
  { id: 1, typeName: "Gas", typeEmoji: "🔥", ownerId: 3, ownerName: "Casey", billDate: ymd(-11), dueDate: ymd(5), total: 62.4, perPersonCost: 15.6, status: "unpaid" as const, pdfPath: null, addedByName: "Casey" },
  { id: 2, typeName: "Wifi", typeEmoji: "🛜", ownerId: 1, ownerName: "Robin", billDate: ymd(-12), dueDate: ymd(12), total: 79.99, perPersonCost: 20.0, status: "unpaid" as const, pdfPath: null, addedByName: "Robin" },
  { id: 3, typeName: "Water", typeEmoji: "💧", ownerId: 4, ownerName: "Morgan", billDate: ymd(-3), dueDate: ymd(19), total: 43.16, perPersonCost: 10.79, status: "unpaid" as const, pdfPath: null, addedByName: "Morgan" },
  { id: 4, typeName: "Electric", typeEmoji: "⚡", ownerId: 2, ownerName: "Jordan", billDate: ymd(-38), dueDate: ymd(-23), total: 104.12, perPersonCost: 26.03, status: "paid" as const, pdfPath: null, addedByName: "Jordan" },
];

/** billId → membership ids who still owe (Jordan already paid Robin back for Wifi). */
export const DEMO_DEBTS = new Map<number, Set<number>>([
  [1, new Set([1, 2, 4])],
  [2, new Set([3, 4])],
  [3, new Set([1, 2, 3])],
]);

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

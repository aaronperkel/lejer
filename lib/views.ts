import {
  type Bill,
  type BillType,
  type Debt,
  type OwedPair,
  type Person,
  countBills,
  getBillTypes,
  getBillsPage,
  getDebts,
  getMyBalance,
  getMembers,
  getOwedPairs,
  getPayer,
  getSplitters,
} from "@/lib/bills";
import type { Ctx } from "@/lib/context";
import { type Tx, withHousehold } from "@/lib/db";
import { type BulkRecipient, bulkRecipients } from "@/lib/bulk";
import { DEMO_BILLS, DEMO_BILL_TYPES, DEMO_PEOPLE, DEMO_SPLITTERS, DEMO_VIEWER, demoDebts, demoMonthTotals } from "@/lib/demo";
import { getCurrentHousehold } from "@/lib/households";
import { BULK_DAILY_LIMIT, sendsToday } from "@/lib/mail";
import { localDate } from "@/lib/time";
import { type Trends, buildTrends, monthTotals, trendTypes, trendsCsv } from "@/lib/trends";
import type { ReminderRun } from "@/lib/types";

// One loader per page: a single withHousehold transaction for a real household, the in-memory
// data for the demo. Pages never branch on ctx.demo themselves.

export interface Paged {
  page: number;
  totalPages: number;
  totalBills: number;
  bills: Bill[];
}

function paginate<T extends { billDate: string; id: number }>(all: T[], page: number, perPage: number) {
  const sorted = [...all].sort((a, b) => b.billDate.localeCompare(a.billDate) || b.id - a.id);
  return sorted.slice((page - 1) * perPage, page * perPage);
}

function pageInfo(totalBills: number, perPage: number, requested: number) {
  const totalPages = Math.max(1, Math.ceil(totalBills / perPage));
  return { totalPages, page: Math.min(Math.max(1, requested), totalPages) };
}

function demoPairs(): OwedPair[] {
  const pairs = new Map<string, OwedPair>();
  for (const b of DEMO_BILLS) {
    for (const d of demoDebts(b.id)) {
      if (d.paid) continue;
      const key = `${d.personId}->${b.ownerId}`;
      const p = pairs.get(key) ?? { debtorId: d.personId, debtor: d.name, ownerId: b.ownerId, owner: b.ownerName, amount: 0 };
      p.amount = Math.round((p.amount + b.perPersonCost) * 100) / 100;
      pairs.set(key, p);
    }
  }
  return [...pairs.values()].sort((a, b) => a.debtor.localeCompare(b.debtor) || (a.owner ?? "").localeCompare(b.owner ?? ""));
}

export interface Dashboard extends Paged {
  owed: { amount: number; billIds: number[]; nextDue: { dueDate: string; typeName: string } | null };
  pairs: OwedPair[];
  /** The household's today (YYYY-MM-DD), for due chips and "days late". */
  today: string;
  /** The soonest-due bill the viewer is owed on, and who hasn't paid it: the payer's "next due". */
  collect: { dueDate: string; typeName: string; debtors: string[] } | null;
  /** The viewer owns at least one bill type (in single_payer mode: the viewer is the payer). */
  ownsTypes: boolean;
  /** The viewer's own calendar feed token (never anyone else's); null in the demo. */
  calendarToken: string | null;
}

export async function loadDashboard(ctx: Ctx, requestedPage: number): Promise<Dashboard> {
  const perPage = ctx.household.billsPerPage;
  const today = localDate(ctx.household.timezone);
  if (ctx.demo) {
    const { page, totalPages } = pageInfo(DEMO_BILLS.length, perPage, requestedPage);
    const mine = DEMO_BILLS.filter((b) => demoDebts(b.id).some((d) => d.personId === ctx.membership.id && !d.paid));
    const next = [...mine].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    return {
      page, totalPages, totalBills: DEMO_BILLS.length, bills: paginate(DEMO_BILLS, page, perPage),
      owed: {
        amount: Math.round(mine.reduce((s, b) => s + b.perPersonCost * 100, 0)) / 100,
        billIds: mine.map((b) => b.id),
        nextDue: next ? { dueDate: next.dueDate, typeName: next.typeName } : null,
      },
      pairs: demoPairs(),
      today,
      collect: (() => {
        const owed = DEMO_BILLS.filter((b) => b.ownerId === ctx.membership.id)
          .map((b) => ({ b, debtors: demoDebts(b.id).filter((d) => !d.paid).map((d) => d.name) }))
          .filter((x) => x.debtors.length > 0)
          .sort((x, y) => x.b.dueDate.localeCompare(y.b.dueDate))[0];
        return owed ? { dueDate: owed.b.dueDate, typeName: owed.b.typeName, debtors: owed.debtors } : null;
      })(),
      ownsTypes: DEMO_BILL_TYPES.some((t) => t.ownerId === ctx.membership.id),
      calendarToken: null,
    };
  }
  return withHousehold(ctx, async (tx) => {
    const totalBills = await countBills(tx);
    const { page, totalPages } = pageInfo(totalBills, perPage, requestedPage);
    const [{ owns }] = await tx<{ owns: boolean }[]>`SELECT EXISTS (SELECT 1 FROM bill_types WHERE owner_id = ${ctx.membership.id}) AS owns`;
    return {
      page, totalPages, totalBills,
      bills: await getBillsPage(tx, perPage, (page - 1) * perPage),
      owed: await getMyBalance(tx, ctx.membership.id),
      pairs: await getOwedPairs(tx),
      today,
      collect: await nextToCollect(tx, ctx.membership.id),
      ownsTypes: owns,
      calendarToken: await myCalendarToken(tx, ctx),
    };
  });
}

export interface BillsView extends Paged {
  /** The household's today (YYYY-MM-DD). */
  today: string;
  types: BillType[];
  splitters: Person[];
  debts: Record<number, Debt[]>;
  pairs: OwedPair[];
}

export async function loadBills(ctx: Ctx, requestedPage: number): Promise<BillsView> {
  const perPage = ctx.household.billsPerPage;
  const today = localDate(ctx.household.timezone);
  if (ctx.demo) {
    const { page, totalPages } = pageInfo(DEMO_BILLS.length, perPage, requestedPage);
    const bills = paginate(DEMO_BILLS, page, perPage);
    return {
      page, totalPages, totalBills: DEMO_BILLS.length, bills, today,
      types: DEMO_BILL_TYPES, splitters: DEMO_SPLITTERS,
      debts: Object.fromEntries(bills.map((b) => [b.id, demoDebts(b.id)])),
      pairs: demoPairs(),
    };
  }
  return withHousehold(ctx, async (tx) => {
    const totalBills = await countBills(tx);
    const { page, totalPages } = pageInfo(totalBills, perPage, requestedPage);
    const bills = await getBillsPage(tx, perPage, (page - 1) * perPage);
    const debts = await getDebts(tx, bills.map((b) => b.id));
    return {
      page, totalPages, totalBills, bills, today,
      types: await getBillTypes(tx),
      splitters: await getSplitters(tx),
      debts: Object.fromEntries(debts),
      pairs: await getOwedPairs(tx),
    };
  });
}

export interface SettingsView {
  /** The cron's bookkeeping for the readout (the settings themselves are on ctx). */
  run: ReminderRun;
  /** Everyone who could be the single payer. */
  members: Person[];
  /** The current payer (the owner the types share), or the first joined admin. */
  payerId: number | null;
}

/** /{slug}/household/settings. */
export async function loadSettings(ctx: Ctx): Promise<SettingsView> {
  if (ctx.demo) {
    return {
      run: { lastRunAt: null, lastSendDate: null, lastSentAt: null, lastSentCount: 0 },
      members: DEMO_PEOPLE.map(({ id, name }) => ({ id, name })),
      payerId: DEMO_VIEWER.id,
    };
  }
  return withHousehold(ctx, async (tx) => {
    const h = await getCurrentHousehold(tx);
    return {
      run: { lastRunAt: h?.lastRunAt ?? null, lastSendDate: h?.lastSendDate ?? null, lastSentAt: h?.lastSentAt ?? null, lastSentCount: h?.lastSentCount ?? 0 },
      members: await getMembers(tx),
      payerId: await getPayer(tx),
    };
  });
}

export interface BulkEmailView {
  joined: BulkRecipient[];
  pending: string[];
  /** Whether a send right now fits under the bulk ceiling (no counts are shown: they're account-wide). */
  fits: boolean;
}

/** /{slug}/household/email: who a note would reach, and whether today's allowance has room for it. */
export async function loadBulkEmail(ctx: Ctx): Promise<BulkEmailView> {
  if (ctx.demo) return { joined: DEMO_PEOPLE.map((p) => ({ name: p.name, email: p.email })), pending: [], fits: true };
  return withHousehold(ctx, async (tx) => {
    const { joined, pending } = await bulkRecipients(tx);
    const used = await sendsToday(tx);
    return { joined, pending, fits: used + joined.length + (ctx.household.digestEmail ? 1 : 0) <= BULK_DAILY_LIMIT };
  });
}

/** /trends: monthly totals per type through this month, in the household's calendar. */
export async function loadTrends(ctx: Ctx): Promise<Trends> {
  const today = localDate(ctx.household.timezone);
  if (ctx.demo) return buildTrends(demoMonthTotals(today), DEMO_BILL_TYPES, today);
  return withHousehold(ctx, async (tx) => buildTrends(await monthTotals(tx), await trendTypes(tx), today));
}

/** /trends/csv: the whole history, every type its own column. */
export async function loadTrendsCsv(ctx: Ctx): Promise<string> {
  if (ctx.demo) return trendsCsv(demoMonthTotals(localDate(ctx.household.timezone)), DEMO_BILL_TYPES);
  return withHousehold(ctx, async (tx) => trendsCsv(await monthTotals(tx), await trendTypes(tx)));
}

/** The soonest-due bill owed to `membershipId` that someone still owes on, with their names. */
async function nextToCollect(tx: Tx, membershipId: number): Promise<Dashboard["collect"]> {
  const [row] = await tx<{ dueDate: string; typeName: string; debtors: string[] }[]>`
    SELECT b.due_date AS "dueDate", t.name AS "typeName", array_agg(u.name ORDER BY u.name) AS debtors
    FROM bills b
    JOIN bill_types t ON t.id = b.type_id
    JOIN bill_debts d ON d.bill_id = b.id AND d.paid_at IS NULL
    JOIN memberships m ON m.id = d.person_id
    JOIN users u ON u.id = m.user_id
    WHERE b.owner_id = ${membershipId}
    GROUP BY b.id, b.due_date, t.name
    ORDER BY b.due_date, b.id LIMIT 1`;
  return row ?? null;
}

/** The viewer's calendar token for this household. Only ever selected for ctx.membership.id. */
async function myCalendarToken(tx: Tx, ctx: Ctx): Promise<string> {
  const [row] = await tx<{ token: string }[]>`SELECT calendar_token AS token FROM memberships WHERE id = ${ctx.membership.id}`;
  return row.token;
}

/** /account: the calendar link for the current household (null in the demo). */
export async function loadCalendarToken(ctx: Ctx): Promise<string | null> {
  if (ctx.demo) return null;
  return withHousehold(ctx, (tx) => myCalendarToken(tx, ctx));
}

/** /welcome: the household's bill types and who fronts each (the tour's first scene). */
export async function loadTour(ctx: Ctx): Promise<{ emoji: string; type: string; owner: string | null }[]> {
  const types = ctx.demo ? DEMO_BILL_TYPES : await withHousehold(ctx, (tx) => getBillTypes(tx));
  return types.slice(0, 4).map((t) => ({ emoji: t.emoji, type: t.name, owner: t.ownerName }));
}

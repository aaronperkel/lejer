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
  getOwedPairs,
  getSplitters,
} from "@/lib/bills";
import type { Ctx } from "@/lib/context";
import { withHousehold } from "@/lib/db";
import { DEMO_BILLS, DEMO_BILL_TYPES, DEMO_SPLITTERS, demoDebts } from "@/lib/demo";

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
  /** The viewer owns at least one bill type (in single_payer mode: the viewer is the payer). */
  ownsTypes: boolean;
}

export async function loadDashboard(ctx: Ctx, requestedPage: number): Promise<Dashboard> {
  const perPage = ctx.household.billsPerPage;
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
      ownsTypes: DEMO_BILL_TYPES.some((t) => t.ownerId === ctx.membership.id),
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
      ownsTypes: owns,
    };
  });
}

export interface Portal extends Paged {
  types: BillType[];
  splitters: Person[];
  debts: Record<number, Debt[]>;
  pairs: OwedPair[];
}

export async function loadPortal(ctx: Ctx, requestedPage: number): Promise<Portal> {
  const perPage = ctx.household.billsPerPage;
  if (ctx.demo) {
    const { page, totalPages } = pageInfo(DEMO_BILLS.length, perPage, requestedPage);
    const bills = paginate(DEMO_BILLS, page, perPage);
    return {
      page, totalPages, totalBills: DEMO_BILLS.length, bills,
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
      page, totalPages, totalBills, bills,
      types: await getBillTypes(tx),
      splitters: await getSplitters(tx),
      debts: Object.fromEntries(debts),
      pairs: await getOwedPairs(tx),
    };
  });
}

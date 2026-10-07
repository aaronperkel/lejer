import { assertAdmin, assertBillManager } from "@/lib/auth";
import type { Ctx } from "@/lib/context";
import type { Tx } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { isYmd } from "@/lib/time";

// Bills, bill types and debts. Every function takes the caller's tx (inside withHousehold);
// mutations also take ctx and authorize themselves (assertAdmin / assertBillManager), so the
// rules hold no matter which action or script calls them.
//
// The model (DESIGN.md §3): a bill type has an owner who fronts it. When a bill is posted, every
// splitter except the owner gets a bill_debts row; that row set is fixed for the life of the
// bill. Paying sets paid_at, un-paying clears it, and the bill is paid exactly when no row has
// paid_at IS NULL (bills.status is kept in step in the same transaction).

export interface BillType {
  id: number;
  name: string;
  emoji: string;
  processingFee: number;
  ownerId: number | null;
  ownerName: string | null;
}

export interface Bill {
  id: number;
  typeId: number;
  typeName: string;
  typeEmoji: string;
  ownerId: number | null; // the type's owner: who the debtors pay back
  ownerName: string | null;
  billDate: string;
  dueDate: string;
  total: number;
  perPersonCost: number;
  status: "paid" | "unpaid";
  pdfPath: string | null;
  addedByName: string | null;
}

export interface Debt {
  personId: number; // membership id
  name: string;
  paid: boolean;
}

export interface OwedPair {
  debtorId: number;
  debtor: string;
  ownerId: number | null; // null: the type has no owner (owed to "the house")
  owner: string | null;
  amount: number;
}

export interface Person {
  id: number; // membership id
  name: string;
}

// ---------------------------------------------------------------------------------------------
// Reads

const typeSelect = (tx: Tx) => tx`
  SELECT t.id, t.name, t.emoji, t.processing_fee AS "processingFee",
         t.owner_id AS "ownerId", ou.name AS "ownerName"
  FROM bill_types t
  LEFT JOIN memberships om ON om.id = t.owner_id
  LEFT JOIN users ou ON ou.id = om.user_id`;

const billSelect = (tx: Tx) => tx`
  SELECT b.id, b.type_id AS "typeId", t.name AS "typeName", t.emoji AS "typeEmoji",
         t.owner_id AS "ownerId", ou.name AS "ownerName",
         b.bill_date AS "billDate", b.due_date AS "dueDate", b.total,
         b.per_person_cost AS "perPersonCost", b.status, b.pdf_path AS "pdfPath",
         au.name AS "addedByName"
  FROM bills b
  JOIN bill_types t ON t.id = b.type_id
  LEFT JOIN memberships om ON om.id = t.owner_id
  LEFT JOIN users ou ON ou.id = om.user_id
  LEFT JOIN memberships am ON am.id = b.added_by_id
  LEFT JOIN users au ON au.id = am.user_id`;

export function getBillTypes(tx: Tx): Promise<BillType[]> {
  return tx<BillType[]>`${typeSelect(tx)} ORDER BY t.name`;
}

export async function getBillType(tx: Tx, id: number): Promise<BillType | null> {
  const [t] = await tx<BillType[]>`${typeSelect(tx)} WHERE t.id = ${id}`;
  return t ?? null;
}

/** Everyone in the household (owner pickers). memberships_read also admits my rows elsewhere. */
export function getMembers(tx: Tx): Promise<Person[]> {
  return tx<Person[]>`
    SELECT m.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.household_id = app_household_id() ORDER BY u.name`;
}

/** The people bills are split among (memberships with splits_bills, pending invites included). */
export function getSplitters(tx: Tx): Promise<Person[]> {
  return tx<Person[]>`
    SELECT m.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.household_id = app_household_id() AND m.splits_bills ORDER BY u.name`;
}

export async function countBills(tx: Tx): Promise<number> {
  const [{ n }] = await tx<{ n: number }[]>`SELECT count(*) AS n FROM bills`;
  return n;
}

export function getBillsPage(tx: Tx, limit: number, offset: number): Promise<Bill[]> {
  return tx<Bill[]>`
    ${billSelect(tx)}
    ORDER BY b.bill_date DESC, b.id DESC
    LIMIT ${Math.max(1, Math.trunc(limit))} OFFSET ${Math.max(0, Math.trunc(offset))}`;
}

export async function getBill(tx: Tx, id: number): Promise<Bill | null> {
  const [b] = await tx<Bill[]>`${billSelect(tx)} WHERE b.id = ${id}`;
  return b ?? null;
}

/** billId → its debt rows (the fixed debtor set, each paid or not). */
export async function getDebts(tx: Tx, billIds: number[]): Promise<Map<number, Debt[]>> {
  const out = new Map<number, Debt[]>();
  if (billIds.length === 0) return out;
  const rows = await tx<(Debt & { billId: number })[]>`
    SELECT d.bill_id AS "billId", d.person_id AS "personId", u.name, d.paid_at IS NOT NULL AS paid
    FROM bill_debts d
    JOIN memberships m ON m.id = d.person_id
    JOIN users u ON u.id = m.user_id
    WHERE d.bill_id = ANY(${billIds})
    ORDER BY u.name`;
  for (const { billId, ...debt } of rows) {
    if (!out.has(billId)) out.set(billId, []);
    out.get(billId)!.push(debt);
  }
  return out;
}

/** What one person still owes: total, which bills, and the soonest due. */
export async function getMyBalance(tx: Tx, membershipId: number) {
  const rows = await tx<{ billId: number; amount: number; dueDate: string; typeName: string }[]>`
    SELECT b.id AS "billId", b.per_person_cost AS amount, b.due_date AS "dueDate", t.name AS "typeName"
    FROM bill_debts d
    JOIN bills b ON b.id = d.bill_id
    JOIN bill_types t ON t.id = b.type_id
    WHERE d.person_id = ${membershipId} AND d.paid_at IS NULL
    ORDER BY b.due_date, b.id`;
  return {
    amount: Math.round(rows.reduce((s, r) => s + r.amount * 100, 0)) / 100,
    billIds: rows.map((r) => r.billId),
    nextDue: rows[0] ? { dueDate: rows[0].dueDate, typeName: rows[0].typeName } : null,
  };
}

/**
 * The house ledger: who owes whom, summed over unpaid debt rows. Debts on a bill run to its
 * type's owner. Works in both modes (single_payer just has one creditor).
 */
export function getOwedPairs(tx: Tx): Promise<OwedPair[]> {
  return tx<OwedPair[]>`
    SELECT d.person_id AS "debtorId", du.name AS debtor, t.owner_id AS "ownerId", ou.name AS owner,
           sum(b.per_person_cost) AS amount
    FROM bill_debts d
    JOIN bills b ON b.id = d.bill_id
    JOIN bill_types t ON t.id = b.type_id
    JOIN memberships dm ON dm.id = d.person_id
    JOIN users du ON du.id = dm.user_id
    LEFT JOIN memberships om ON om.id = t.owner_id
    LEFT JOIN users ou ON ou.id = om.user_id
    WHERE d.paid_at IS NULL
    GROUP BY d.person_id, du.name, t.owner_id, ou.name
    ORDER BY du.name, ou.name NULLS LAST`;
}

/**
 * Single-payer mode's payer: the owner shared by the household's types (the most common one if
 * they somehow differ), else the first joined admin.
 */
export async function getPayer(tx: Tx): Promise<number | null> {
  const [owner] = await tx<{ id: number }[]>`
    SELECT owner_id AS id FROM bill_types WHERE owner_id IS NOT NULL
    GROUP BY owner_id ORDER BY count(*) DESC, owner_id LIMIT 1`;
  if (owner) return owner.id;
  const [admin] = await tx<{ id: number }[]>`
    SELECT id FROM memberships
    WHERE household_id = app_household_id() AND role = 'admin' AND joined_at IS NOT NULL
    ORDER BY joined_at, id LIMIT 1`;
  return admin?.id ?? null;
}

// ---------------------------------------------------------------------------------------------
// Split math

/**
 * total = amount + fee; per person = round(total / splitters, 2), the owner counting in the
 * denominator if they split; every splitter except the owner owes. No owner → every splitter
 * owes. Done in cents so 0.1 + 0.2 never shows up on a bill.
 */
export function computeSplit(input: { amount: number; fee: number; splitterIds: number[]; ownerId: number | null }) {
  const totalCents = Math.round(input.amount * 100) + Math.round(input.fee * 100);
  const n = input.splitterIds.length;
  return {
    total: totalCents / 100,
    perPersonCost: n > 0 ? Math.round(totalCents / n) / 100 : 0,
    debtorIds: input.splitterIds.filter((id) => id !== input.ownerId),
  };
}

/** Parses a money field: positive, at most two decimals, under a million. */
export function parseAmount(raw: unknown): number | null {
  const s = String(raw ?? "").trim().replace(/^\$/, "").replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n < 1_000_000 ? n : null;
}

// ---------------------------------------------------------------------------------------------
// Mutations

export interface NewBill {
  typeId: number;
  amount: number;
  billDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
}

export interface CreatedBill {
  billId: number;
  type: BillType;
  total: number;
  perPersonCost: number;
  debtors: Person[];
  splitters: Person[];
}

/**
 * Checks everything createBill would (permission, type, dates, someone to split with) and
 * reserves the bill's id, so a PDF can be uploaded under its final key before the row exists.
 */
export async function prepareBill(tx: Tx, ctx: Ctx, input: NewBill): Promise<{ billId: number; type: BillType }> {
  const { type } = await validateBill(tx, ctx, input);
  const [{ id }] = await tx<{ id: number }[]>`SELECT nextval(pg_get_serial_sequence('bills', 'id'))::int AS id`;
  return { billId: id, type };
}

async function validateBill(tx: Tx, ctx: Ctx, input: NewBill) {
  const type = await getBillType(tx, input.typeId);
  if (!type) throw new ActionError("Pick a bill type.");
  await assertBillManager(tx, ctx, type.id);
  if (!(input.amount > 0 && input.amount < 1_000_000)) throw new ActionError("Enter the amount on the bill.");
  if (!isYmd(input.billDate)) throw new ActionError("Enter the statement date as a date.");
  if (!isYmd(input.dueDate)) throw new ActionError("Enter the due date as a date.");
  const splitters = await getSplitters(tx);
  if (splitters.length === 0) throw new ActionError("Nobody in this household splits bills yet.");
  return { type, splitters };
}

/** Posts a bill and its fixed debtor set. `billId` comes from prepareBill when a PDF goes first. */
export async function createBill(
  tx: Tx,
  ctx: Ctx,
  input: NewBill,
  opts: { billId?: number; pdfPath?: string | null } = {},
): Promise<CreatedBill> {
  const { type, splitters } = await validateBill(tx, ctx, input);
  const split = computeSplit({ amount: input.amount, fee: type.processingFee, splitterIds: splitters.map((s) => s.id), ownerId: type.ownerId });
  const status = split.debtorIds.length > 0 ? "unpaid" : "paid";

  const [{ id }] = opts.billId
    ? await tx<{ id: number }[]>`
        INSERT INTO bills (id, household_id, type_id, bill_date, due_date, total, per_person_cost, status, pdf_path, added_by_id)
        OVERRIDING SYSTEM VALUE
        VALUES (${opts.billId}, ${ctx.household.id}, ${type.id}, ${input.billDate}, ${input.dueDate}, ${split.total},
                ${split.perPersonCost}, ${status}, ${opts.pdfPath ?? null}, ${ctx.membership.id})
        RETURNING id`
    : await tx<{ id: number }[]>`
        INSERT INTO bills (household_id, type_id, bill_date, due_date, total, per_person_cost, status, pdf_path, added_by_id)
        VALUES (${ctx.household.id}, ${type.id}, ${input.billDate}, ${input.dueDate}, ${split.total},
                ${split.perPersonCost}, ${status}, ${opts.pdfPath ?? null}, ${ctx.membership.id})
        RETURNING id`;

  if (split.debtorIds.length > 0) {
    await tx`
      INSERT INTO bill_debts (household_id, bill_id, person_id)
      SELECT ${ctx.household.id}, ${id}, unnest(${split.debtorIds}::int[])`;
  }
  return {
    billId: id,
    type,
    total: split.total,
    perPersonCost: split.perPersonCost,
    debtors: splitters.filter((s) => split.debtorIds.includes(s.id)),
    splitters,
  };
}

/** Re-derives bills.status from the debt rows (paid ⇔ no row has paid_at IS NULL). */
export async function refreshBillStatus(tx: Tx, billIds: number[]): Promise<Map<number, Bill["status"]>> {
  if (billIds.length === 0) return new Map();
  const rows = await tx<{ id: number; status: Bill["status"] }[]>`
    UPDATE bills b SET status = CASE
      WHEN EXISTS (SELECT 1 FROM bill_debts d WHERE d.bill_id = b.id AND d.paid_at IS NULL) THEN 'unpaid'
      ELSE 'paid' END
    WHERE b.id = ANY(${billIds})
    RETURNING b.id, b.status`;
  return new Map(rows.map((r) => [r.id, r.status]));
}

/**
 * Marks one debtor paid or unpaid on one bill. Only rows that exist can change: the debtor set
 * was fixed when the bill was posted, so un-paying restores exactly the original debtor and
 * nobody who joined later can be added. Queues (or cancels) a thank-you when feature_thanks.
 */
export async function setPaid(tx: Tx, ctx: Ctx, billId: number, membershipId: number, paid: boolean): Promise<Bill["status"]> {
  if (ctx.demo) throw new ActionError(DEMO_REFUSAL);
  const [bill] = await tx<{ typeId: number }[]>`SELECT type_id AS "typeId" FROM bills WHERE id = ${billId} FOR UPDATE`;
  if (!bill) throw new ActionError("That bill no longer exists.");
  await assertBillManager(tx, ctx, bill.typeId);

  const changed = await tx`
    UPDATE bill_debts SET paid_at = CASE WHEN ${paid} THEN coalesce(paid_at, now()) END
    WHERE bill_id = ${billId} AND person_id = ${membershipId}
    RETURNING person_id`;
  if (changed.length === 0) throw new ActionError("That person doesn't owe on this bill.");

  if (ctx.household.featureThanks && paid) {
    // Re-checking restarts the 10-minute debounce (lib/thanks.ts flushes, phase 4).
    await tx`
      INSERT INTO payment_thanks (household_id, bill_id, person_id) VALUES (${ctx.household.id}, ${billId}, ${membershipId})
      ON CONFLICT (bill_id, person_id) DO UPDATE SET queued_at = now()`;
  } else if (!paid) {
    await tx`DELETE FROM payment_thanks WHERE bill_id = ${billId} AND person_id = ${membershipId}`;
  }
  return (await refreshBillStatus(tx, [billId])).get(billId)!;
}

export interface BillTypeInput {
  id?: number;
  name: string;
  emoji: string;
  processingFee: number;
  ownerId: number | null;
}

/** Add or edit a bill type (admins). In single_payer mode the owner is always the payer. */
export async function saveBillType(tx: Tx, ctx: Ctx, input: BillTypeInput): Promise<BillType> {
  assertAdmin(ctx);
  const name = input.name.trim();
  const emoji = input.emoji.trim();
  if (!name || name.length > 40) throw new ActionError("Name the bill type (up to 40 characters).");
  if (!emoji || [...emoji].length > 4) throw new ActionError("Pick one emoji for the bill type.");
  if (!(input.processingFee >= 0 && input.processingFee < 1000)) throw new ActionError("The processing fee must be zero or more.");
  const ownerId = ctx.household.mode === "single_payer" ? await getPayer(tx) : input.ownerId;
  if (ownerId !== null && !(await getMembers(tx)).some((m) => m.id === ownerId)) {
    throw new ActionError("Pick an owner from this household.");
  }
  try {
    const [row] = input.id
      ? await tx<{ id: number }[]>`
          UPDATE bill_types SET name = ${name}, emoji = ${emoji}, processing_fee = ${input.processingFee}, owner_id = ${ownerId}
          WHERE id = ${input.id} RETURNING id`
      : await tx<{ id: number }[]>`
          INSERT INTO bill_types (household_id, name, emoji, processing_fee, owner_id)
          VALUES (${ctx.household.id}, ${name}, ${emoji}, ${input.processingFee}, ${ownerId}) RETURNING id`;
    if (!row) throw new ActionError("That bill type no longer exists.");
    return (await getBillType(tx, row.id))!;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ActionError(`There's already a bill type called ${name}.`);
    throw e;
  }
}

/** Removes a bill type with no bills (the FK is RESTRICT; this says why first). */
export async function removeBillType(tx: Tx, ctx: Ctx, id: number): Promise<string> {
  assertAdmin(ctx);
  const type = await getBillType(tx, id);
  if (!type) throw new ActionError("That bill type no longer exists.");
  const [{ n }] = await tx<{ n: number }[]>`SELECT count(*) AS n FROM bills WHERE type_id = ${id}`;
  if (n > 0) throw new ActionError(`${type.name} has ${n} bill${n === 1 ? "" : "s"} on record, so it can't be removed.`);
  await tx`DELETE FROM bill_types WHERE id = ${id}`;
  return type.name;
}

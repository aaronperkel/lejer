import { assertAdmin, assertBillManager, assertCanManage } from "@/lib/auth";
import type { Ctx } from "@/lib/context";
import type { Tx } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { isYmd } from "@/lib/time";

// Bills, bill types and debts. Every function takes the caller's tx (inside withHousehold);
// mutations also take ctx and authorize themselves (assertAdmin / assertBillManager), so the
// rules hold no matter which action or script calls them.
//
// The model (ARCHITECTURE.md §3): a bill type has an owner who fronts it. When a bill is posted, the
// type's owner is snapshotted into bills.owner_id (0004) and every splitter except that owner
// gets a bill_debts row; both are fixed for the life of the bill. Reassigning a type only
// changes who owns *new* bills. Paying sets paid_at, un-paying clears it, and the bill is paid exactly when no row has
// paid_at IS NULL (bills.status is kept in step in the same transaction).
//
// Until someone is marked paid, a bill can be edited or deleted (0005). Its split set (the
// shares it was split over: the debtors, plus the owner when they held one) is frozen at post
// time, so an edit recomputes the figures over the same people and never consults today's
// splitters. Its new-bill email waits in a queue on the bill row (lib/notices.ts).

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
  ownerId: number | null; // the bill's owner (snapshotted at post time): who the debtors pay back
  ownerName: string | null; // FORMER_MEMBER once that owner has been removed
  billDate: string;
  dueDate: string;
  total: number;
  perPersonCost: number;
  status: "paid" | "unpaid";
  pdfPath: string | null;
  addedByName: string | null;
  /** The amount typed when posting: total − fee. */
  amount: number;
  /** The processing fee the bill was posted with. */
  fee: number;
  /** How many shares it was split over (frozen at post time). */
  shares: number;
  /** Someone has been marked paid, so the bill can no longer be edited or deleted. */
  locked: boolean;
  /** The first new-bill email has gone out. */
  notified: boolean;
}

export interface Debt {
  personId: number; // membership id
  name: string;
  paid: boolean;
}

export interface OwedPair {
  debtorId: number;
  debtor: string;
  ownerId: number | null; // null: owed to "the house", or the owner was removed (owner = FORMER_MEMBER)
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

/** What a bill's owner reads as after their membership is removed (owner_id SET NULL). */
export const FORMER_MEMBER = "former member";

const ownerLabel = (tx: Tx) => tx`CASE WHEN b.owner_id IS NULL AND b.had_owner THEN ${FORMER_MEMBER}::text ELSE ou.name END`;

const billSelect = (tx: Tx) => tx`
  SELECT b.id, b.type_id AS "typeId", t.name AS "typeName", t.emoji AS "typeEmoji",
         b.owner_id AS "ownerId", ${ownerLabel(tx)} AS "ownerName",
         b.bill_date AS "billDate", b.due_date AS "dueDate", b.total,
         b.per_person_cost AS "perPersonCost", b.status, b.pdf_path AS "pdfPath",
         au.name AS "addedByName", b.total - b.fee AS amount, b.fee, b.shares,
         EXISTS (SELECT 1 FROM bill_debts x WHERE x.bill_id = b.id AND x.paid_at IS NOT NULL) AS locked,
         b.notified_at IS NOT NULL AS notified
  FROM bills b
  JOIN bill_types t ON t.id = b.type_id
  LEFT JOIN memberships om ON om.id = b.owner_id
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
 * The house ledger: who owes whom, summed over unpaid debt rows. Debts on a bill run to the
 * bill's own owner (snapshotted at post time). Works in both modes (single_payer just has one
 * creditor).
 */
export function getOwedPairs(tx: Tx): Promise<OwedPair[]> {
  return tx<OwedPair[]>`
    SELECT d.person_id AS "debtorId", du.name AS debtor, b.owner_id AS "ownerId", ${ownerLabel(tx)} AS owner,
           sum(b.per_person_cost) AS amount
    FROM bill_debts d
    JOIN bills b ON b.id = d.bill_id
    JOIN memberships dm ON dm.id = d.person_id
    JOIN users du ON du.id = dm.user_id
    LEFT JOIN memberships om ON om.id = b.owner_id
    LEFT JOIN users ou ON ou.id = om.user_id
    WHERE d.paid_at IS NULL
    GROUP BY d.person_id, du.name, b.owner_id, b.had_owner, ou.name
    ORDER BY du.name, 4 NULLS LAST`;
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
  const ownerShare = splitters.some((s) => s.id === type.ownerId);
  // The new-bill email waits NOTICE_DELAY_MINUTES in the queue (lib/notices.ts): time to fix a bad post.
  const values = tx`
    ${ctx.household.id}, ${type.id}, ${input.billDate}, ${input.dueDate}, ${split.total}, ${split.perPersonCost}, ${status},
    ${opts.pdfPath ?? null}, ${ctx.membership.id}, ${type.ownerId}, ${type.ownerId !== null}, ${type.processingFee},
    ${splitters.length}, ${ownerShare}, 'new', now()`;
  const columns = tx`household_id, type_id, bill_date, due_date, total, per_person_cost, status, pdf_path,
    added_by_id, owner_id, had_owner, fee, shares, owner_share, notice_kind, notice_queued_at`;
  const [{ id }] = opts.billId
    ? await tx<{ id: number }[]>`
        INSERT INTO bills (id, ${columns}) OVERRIDING SYSTEM VALUE VALUES (${opts.billId}, ${values}) RETURNING id`
    : await tx<{ id: number }[]>`INSERT INTO bills (${columns}) VALUES (${values}) RETURNING id`;

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
  const [bill] = await tx<{ ownerId: number | null }[]>`SELECT owner_id AS "ownerId" FROM bills WHERE id = ${billId} FOR UPDATE`;
  if (!bill) throw new ActionError("That bill no longer exists.");
  assertCanManage(ctx, bill.ownerId);

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

// ---------------------------------------------------------------------------------------------
// Fixing a posted bill (0005)

export const LOCKED_BILL = "Someone has already been marked paid on this bill, so it can't be changed. Uncheck them first if it's wrong.";

interface LockedRow {
  typeId: number;
  ownerId: number | null;
  hadOwner: boolean;
  ownerShare: boolean;
  shares: number;
  fee: number;
  billDate: string;
  pdfPath: string | null;
  notified: boolean;
  extra: number[];
  locked: boolean;
}

/**
 * Locks one bill for an edit or a delete and checks the rules: it exists, the caller may manage
 * it (its own owner, or an admin), and nobody has been marked paid. setPaid takes the same row
 * lock, so an edit and a payment can't interleave.
 */
async function lockForChange(tx: Tx, ctx: Ctx, billId: number): Promise<LockedRow> {
  if (ctx.demo) throw new ActionError(DEMO_REFUSAL);
  const [bill] = await tx<LockedRow[]>`
    SELECT type_id AS "typeId", owner_id AS "ownerId", had_owner AS "hadOwner", owner_share AS "ownerShare", shares, fee,
           bill_date AS "billDate", pdf_path AS "pdfPath", notified_at IS NOT NULL AS notified, notice_extra AS extra,
           EXISTS (SELECT 1 FROM bill_debts d WHERE d.bill_id = bills.id AND d.paid_at IS NOT NULL) AS locked
    FROM bills WHERE id = ${billId} FOR UPDATE`;
  if (!bill) throw new ActionError("That bill no longer exists.");
  assertCanManage(ctx, bill.ownerId);
  if (bill.locked) throw new ActionError(LOCKED_BILL);
  return bill;
}

async function debtorIds(tx: Tx, billId: number): Promise<number[]> {
  return (await tx<{ id: number }[]>`SELECT person_id AS id FROM bill_debts WHERE bill_id = ${billId} ORDER BY person_id`).map((r) => r.id);
}

export interface BillEdit {
  typeId: number;
  amount: number;
  billDate: string; // ignored unless the household asks for statement dates
  dueDate: string;
}

export interface EditedBill {
  billId: number;
  typeName: string;
  /** The key the bill pointed at before; the caller deletes it after commit if it changed. */
  oldPdfPath: string | null;
  pdfPath: string | null;
  /** True when the first email had already gone, so this edit queued an "Updated bill" email. */
  updateQueued: boolean;
}

/**
 * Edits a bill nobody has paid on. The split set is frozen at post time (the debtors, plus the
 * owner if they held a share): the figures are recomputed over the same `shares`, and today's
 * splitters are never consulted, so someone who joined since never becomes a debtor.
 *
 * Changing the type re-snapshots the owner from the new type. The set stays the same size: the
 * new owner (if they're in it) stops owing, the old owner (if they held a share) starts, and a
 * type with no owner means everyone in the set owes. The type's fee applies on a type change;
 * otherwise the bill keeps the fee it was posted with.
 *
 * The email: still queued → the 10-minute window restarts (one email, with the final figures).
 * Already sent → an "updated" email is queued for everyone on the bill before or after the
 * edit, so anyone it dropped hears about it. `pdfPath`: undefined keeps the file, null removes it.
 */
export async function updateBill(tx: Tx, ctx: Ctx, billId: number, input: BillEdit, opts: { pdfPath?: string | null } = {}): Promise<EditedBill> {
  const cur = await lockForChange(tx, ctx, billId);
  const type = await getBillType(tx, input.typeId);
  if (!type) throw new ActionError("Pick a bill type.");
  const typeChanged = type.id !== cur.typeId;
  if (typeChanged) await assertBillManager(tx, ctx, type.id);
  if (!(input.amount > 0 && input.amount < 1_000_000)) throw new ActionError("Enter the amount on the bill.");
  const billDate = ctx.household.askBillDate ? input.billDate : cur.billDate;
  if (!isYmd(billDate)) throw new ActionError("Enter the statement date as a date.");
  if (!isYmd(input.dueDate)) throw new ActionError("Enter the due date as a date.");

  const before = await debtorIds(tx, billId);
  // The frozen split set: everyone who held a share and is still a member.
  const set = [...before, ...(cur.ownerShare && cur.ownerId !== null ? [cur.ownerId] : [])];
  const ownerId = typeChanged ? type.ownerId : cur.ownerId;
  const hadOwner = typeChanged ? type.ownerId !== null : cur.hadOwner;
  const debtors = set.filter((id) => id !== ownerId);
  const fee = typeChanged ? type.processingFee : cur.fee;
  const totalCents = Math.round(input.amount * 100) + Math.round(fee * 100);
  const perPersonCost = Math.round(totalCents / cur.shares) / 100;

  // Who an "updated" email must also reach: everyone on the bill before this edit.
  const extra = cur.notified ? [...new Set([...cur.extra, ...before, ...(cur.ownerId !== null ? [cur.ownerId] : [])])] : [];
  const pdfPath = opts.pdfPath === undefined ? cur.pdfPath : opts.pdfPath;

  await tx`
    UPDATE bills SET
      type_id = ${type.id}, bill_date = ${billDate}, due_date = ${input.dueDate},
      total = ${totalCents / 100}, per_person_cost = ${perPersonCost}, fee = ${fee},
      owner_id = ${ownerId}, had_owner = ${hadOwner}, owner_share = ${ownerId !== null && set.includes(ownerId)},
      pdf_path = ${pdfPath},
      notice_kind = ${cur.notified ? "updated" : "new"}, notice_queued_at = now(), notice_extra = ${extra}::int[]
    WHERE id = ${billId}`;
  // Nobody has paid, so the rows carry no history: rebuild them for the (possibly new) owner.
  await tx`DELETE FROM bill_debts WHERE bill_id = ${billId}`;
  if (debtors.length > 0) {
    await tx`
      INSERT INTO bill_debts (household_id, bill_id, person_id)
      SELECT ${ctx.household.id}, ${billId}, unnest(${debtors}::int[])`;
  }
  await refreshBillStatus(tx, [billId]);
  return { billId, typeName: type.name, oldPdfPath: cur.pdfPath, pdfPath, updateQueued: cur.notified };
}

export interface RemovedBill {
  billId: number;
  typeName: string;
  total: number;
  perPersonCost: number;
  dueDate: string;
  ownerId: number | null;
  ownerName: string | null;
  /** Everyone who owed on it (or heard they did, if an update was still queued). */
  debtorIds: number[];
  pdfPath: string | null;
  /** The first email had gone out, so the people on the bill should hear it's gone. */
  notified: boolean;
}

/** Deletes a bill nobody has paid on. Its debts, thanks and queued email go with it. */
export async function deleteBill(tx: Tx, ctx: Ctx, billId: number): Promise<RemovedBill> {
  const cur = await lockForChange(tx, ctx, billId);
  const bill = (await getBill(tx, billId))!;
  const debtors = await debtorIds(tx, billId);
  await tx`DELETE FROM bills WHERE id = ${billId}`;
  return {
    billId,
    typeName: bill.typeName,
    total: bill.total,
    perPersonCost: bill.perPersonCost,
    dueDate: bill.dueDate,
    ownerId: bill.ownerId,
    ownerName: bill.ownerName,
    debtorIds: [...new Set([...debtors, ...cur.extra])].filter((id) => id !== bill.ownerId),
    pdfPath: cur.pdfPath,
    notified: cur.notified,
  };
}

// ---------------------------------------------------------------------------------------------
// The house ledger: gross, with a settling hint

export interface NetPair extends OwedPair {
  /** Set when both people owe each other: the gross amount this way and the amount the other way. */
  gross: { owed: number; offset: number } | null;
}

/**
 * What one transfer would settle between two people who owe each other: Alex owes Sam $30 and
 * Sam owes Alex $12 → Alex pays Sam $18. Pairs owed to the house or a former member have
 * nobody to offset against and pass through as they are; a pair that comes out even
 * disappears. Arithmetic only: the record is per bill and stays gross (see ledgerGroups).
 */
export function netPairs(pairs: OwedPair[]): NetPair[] {
  const cents = (n: number) => Math.round(n * 100);
  const byKey = new Map(pairs.filter((p) => p.ownerId !== null).map((p) => [`${p.debtorId}->${p.ownerId}`, p]));
  const out: NetPair[] = [];
  const done = new Set<string>();
  for (const p of pairs) {
    if (p.ownerId === null) {
      out.push({ ...p, gross: null });
      continue;
    }
    const key = `${p.debtorId}->${p.ownerId}`;
    if (done.has(key)) continue;
    const back = byKey.get(`${p.ownerId}->${p.debtorId}`);
    done.add(key).add(`${p.ownerId}->${p.debtorId}`);
    if (!back) {
      out.push({ ...p, gross: null });
      continue;
    }
    const diff = cents(p.amount) - cents(back.amount);
    if (diff === 0) continue;
    const [a, b] = diff > 0 ? [p, back] : [back, p];
    out.push({ ...a, amount: Math.abs(diff) / 100, gross: { owed: a.amount, offset: b.amount } });
  }
  return out;
}

export interface LedgerGroup {
  /** The gross rows, as recorded: one, or the two directions of a pair that runs both ways. */
  rows: OwedPair[];
  /** Only for a pair that runs both ways: the one transfer that would settle it, or "even". */
  settle: NetPair | "even" | null;
}

/**
 * The dashboard's house ledger (decided 2026-10-07): every row is the gross amount recorded per
 * bill, in both directions, agreeing with the strip, the portal and the reminders. When two
 * people owe each other, their two rows sit together and carry a secondary hint with the net
 * (netPairs), so they can settle in one transfer and check off each other's bills. No net
 * figure is ever the primary number. Order follows `pairs` (first appearance of each pair).
 */
export function ledgerGroups(pairs: OwedPair[]): LedgerGroup[] {
  const key = (p: OwedPair) => (p.ownerId === null ? null : [p.debtorId, p.ownerId].sort((x, y) => x - y).join("|"));
  const groups: LedgerGroup[] = [];
  const byKey = new Map<string, LedgerGroup>();
  for (const p of pairs) {
    const k = key(p);
    const existing = k ? byKey.get(k) : undefined;
    if (existing) {
      existing.rows.push(p);
      continue;
    }
    const g: LedgerGroup = { rows: [p], settle: null };
    groups.push(g);
    if (k) byKey.set(k, g);
  }
  for (const g of groups) {
    if (g.rows.length === 2) g.settle = netPairs(g.rows)[0] ?? "even";
  }
  return groups;
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

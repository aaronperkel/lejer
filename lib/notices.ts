import { createElement } from "react";
import BillRemoved from "@/emails/BillRemoved";
import DigestCopy, { type DigestCopyProps, digestSubject } from "@/emails/DigestCopy";
import NewBill from "@/emails/NewBill";
import { type Bill, type RemovedBill, getBill, getDebts } from "@/lib/bills";
import type { Ctx } from "@/lib/context";
import { type TenantScope, type Tx, withHousehold } from "@/lib/db";
import { type Mailer, mailer as defaultMailer } from "@/lib/mail";
import { NOTICE_DELAY_MINUTES } from "@/lib/notice-delay";
import type { Household } from "@/lib/types";

// The new-bill email queue (0005, ARCHITECTURE.md §3 "Fixing a posted bill"). Posting a bill
// queues its email on the bill row instead of sending; it goes out once it has sat for
// NOTICE_DELAY_MINUTES, so a bad post can be edited or deleted before anyone hears about it.
// An edit inside the window restarts the clock (one email, with the final figures); deleting the
// bill deletes the queue entry with it. An edit after the email went out queues an "updated"
// email for everyone on the bill before or after the edit. Flushed by every cron tick and,
// through after(), by every bill mutation, like the thanks queue (lib/thanks.ts).
//
// Recipients are joined members only (a pending invite gets nothing but the invite). A new bill:
// its debtors, and its owner if they split bills. An update: everyone who was a debtor before
// or after the edit, plus both owners. The split set is frozen, so the only person an edit can
// drop is a previous owner who didn't hold a share; they're told it's no longer theirs.

export { NOTICE_DELAY_MINUTES };

export interface NoticeResult {
  sent: number;
  failed: number;
  /** Bills whose email is still inside its window. */
  pending: number;
}

interface Claimed {
  id: number;
  kind: "new" | "updated";
  queuedAt: Date;
  extra: number[];
  prevNotifiedAt: Date | null;
}

interface Person {
  id: number;
  name: string;
  email: string;
  splitsBills: boolean;
}

interface Batch {
  claim: Claimed;
  bill: Bill;
  debtors: Person[];
  owner: Person | null;
  released: Person[];
}

async function people(tx: Tx, ids: number[]): Promise<Map<number, Person>> {
  if (ids.length === 0) return new Map();
  const rows = await tx<Person[]>`
    SELECT m.id, u.name, u.email, m.splits_bills AS "splitsBills"
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.id = ANY(${ids}) AND m.household_id = app_household_id() AND m.joined_at IS NOT NULL`;
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Sends every queued bill email in the scope's household whose window has passed. Rows are
 * claimed with one UPDATE … RETURNING (SKIP LOCKED, so a bill mid-edit waits for the next flush),
 * so concurrent flushers never send the same email twice. A bill whose every send failed goes
 * back in the queue as it was, unless an edit has re-queued it in the meantime.
 */
export async function flushBillNotices(scope: TenantScope & { household: Household }, opts: { now?: Date; mailer?: Mailer } = {}): Promise<NoticeResult> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - NOTICE_DELAY_MINUTES * 60_000);
  const mail = opts.mailer ?? defaultMailer;

  const batches = await withHousehold(scope, async (tx) => {
    const claimed = await tx<Claimed[]>`
      WITH due AS (
        SELECT id, notice_kind, notice_queued_at, notice_extra, notified_at FROM bills
        WHERE notice_queued_at <= ${cutoff} FOR UPDATE SKIP LOCKED)
      UPDATE bills b SET notice_kind = NULL, notice_queued_at = NULL, notice_extra = '{}',
             notified_at = coalesce(b.notified_at, ${now})
      FROM due WHERE b.id = due.id
      RETURNING b.id, due.notice_kind AS kind, due.notice_queued_at AS "queuedAt", due.notice_extra AS extra,
                due.notified_at AS "prevNotifiedAt"`;
    if (claimed.length === 0) return [];
    const debts = await getDebts(tx, claimed.map((c) => c.id));
    const out: Batch[] = [];
    for (const claim of claimed) {
      const bill = (await getBill(tx, claim.id))!;
      const debtorIds = (debts.get(bill.id) ?? []).map((d) => d.personId);
      const all = await people(tx, [...debtorIds, ...(bill.ownerId !== null ? [bill.ownerId] : []), ...claim.extra]);
      const ownerRow = bill.ownerId !== null ? (all.get(bill.ownerId) ?? null) : null;
      out.push({
        claim,
        bill,
        debtors: debtorIds.flatMap((id) => all.get(id) ?? []),
        // A non-splitter gets no new-bill mail, but an owner always hears about a correction.
        owner: ownerRow && (ownerRow.splitsBills || claim.kind === "updated") ? ownerRow : null,
        released: claim.kind === "updated" ? claim.extra.filter((id) => id !== bill.ownerId && !debtorIds.includes(id)).flatMap((id) => all.get(id) ?? []) : [],
      });
    }
    return out;
  });

  const result: NoticeResult = { sent: 0, failed: 0, pending: 0 };
  for (const b of batches) {
    const { sent, failed, sentTo } = await sendBatch(scope, b, mail);
    result.sent += sent;
    result.failed += failed;
    if (sent === 0 && failed > 0) {
      // Back in the queue as it was (due again next flush), unless an edit re-queued it since.
      await withHousehold(scope, (tx) => tx`
        UPDATE bills SET notice_kind = ${b.claim.kind}, notice_queued_at = ${b.claim.queuedAt},
               notice_extra = ${b.claim.extra}::int[], notified_at = ${b.claim.prevNotifiedAt}
        WHERE id = ${b.bill.id} AND notice_queued_at IS NULL`);
      continue;
    }
    await sendDigest(scope, mail, {
      event: b.claim.kind === "new" ? "new_bill" : "bill_updated",
      actorName: b.claim.kind === "new" ? b.bill.addedByName : null,
      typeName: b.bill.typeName,
      total: b.bill.total,
      perPersonCost: b.bill.perPersonCost,
      dueDate: b.bill.dueDate,
      sentTo,
      failed,
    });
  }

  const [{ n }] = await withHousehold(scope, (tx) => tx<{ n: number }[]>`SELECT count(*) AS n FROM bills WHERE notice_queued_at IS NOT NULL`);
  result.pending = n;
  return result;
}

async function sendBatch(scope: TenantScope & { household: Household }, b: Batch, mail: Mailer) {
  const { bill } = b;
  const updated = b.claim.kind === "updated";
  const ownerName = bill.ownerId === null ? null : bill.ownerName; // no "pay a former member"
  const recipients = [
    ...(b.owner ? [{ p: b.owner, role: "owner" as const }] : []),
    ...b.debtors.map((p) => ({ p, role: "debtor" as const })),
    ...b.released.map((p) => ({ p, role: "released" as const })),
  ];
  const each = `$${bill.perPersonCost.toFixed(2)}`;
  let sent = 0;
  let failed = 0;
  const sentTo: string[] = [];
  for (const { p, role } of recipients) {
    const subject =
      role === "released"
        ? `Corrected: ${bill.typeName}, you're no longer on it`
        : `${updated ? "Corrected" : "New bill"}: ${bill.typeName}, ${each} ${role === "owner" ? "each owed to you" : "your share"}`;
    const ok = await mail.send({
      ctx: scope,
      to: p.email,
      subject,
      react: createElement(NewBill, {
        theme: scope.household.theme,
        householdName: scope.household.name,
        recipientName: p.name,
        typeName: bill.typeName,
        total: bill.total,
        perPersonCost: bill.perPersonCost,
        dueDate: bill.dueDate,
        ownerName,
        postedByName: bill.addedByName ?? "Someone",
        isOwner: role === "owner",
        debtorNames: b.debtors.map((d) => d.name),
        hasPdf: bill.pdfPath !== null,
        variant: b.claim.kind,
        released: role === "released",
      }),
      kind: updated ? "bill_updated" : "new_bill",
      replyTo: b.owner?.email ?? (await ownerEmail(scope, bill.ownerId)),
    });
    if (ok) {
      sent++;
      sentTo.push(p.name);
    } else failed++;
  }
  return { sent, failed, sentTo };
}

async function ownerEmail(scope: TenantScope, ownerId: number | null): Promise<string | null> {
  if (ownerId === null) return null;
  const [o] = await withHousehold(scope, (tx) => tx<{ email: string }[]>`
    SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ${ownerId}`);
  return o?.email ?? null;
}

async function sendDigest(
  scope: TenantScope & { household: Household },
  mail: Mailer,
  p: Omit<DigestCopyProps, "theme" | "householdName">,
): Promise<void> {
  const to = scope.household.digestEmail;
  if (!to) return;
  await mail.send({
    ctx: scope,
    to,
    subject: digestSubject(p.event, p.typeName, p.sentTo.length),
    react: createElement(DigestCopy, { ...p, theme: scope.household.theme, householdName: scope.household.name }),
    kind: "digest",
  });
}

/**
 * After a bill that had already been emailed is deleted: one note to each joined person it was
 * emailed about (its debtors, and the owner if they split bills), sent right away. A bill whose
 * email was still queued gets nothing: nobody had heard of it.
 */
export async function sendBillRemoved(ctx: Ctx, removed: RemovedBill, opts: { mailer?: Mailer } = {}): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  if (!removed.notified) return out;
  const mail = opts.mailer ?? defaultMailer;
  const all = await withHousehold(ctx, (tx) => people(tx, [...removed.debtorIds, ...(removed.ownerId !== null ? [removed.ownerId] : [])]));
  const owner = removed.ownerId !== null ? all.get(removed.ownerId) : undefined;
  const recipients = [
    ...(owner?.splitsBills ? [{ p: owner, isOwner: true }] : []),
    ...removed.debtorIds.flatMap((id) => (all.has(id) ? [{ p: all.get(id)!, isOwner: false }] : [])),
  ];
  const sentTo: string[] = [];
  for (const { p, isOwner } of recipients) {
    const ok = await mail.send({
      ctx,
      to: p.email,
      subject: `Removed: ${removed.typeName}, ${isOwner ? "nobody owes you on it now" : "you don't owe this one"}`,
      react: createElement(BillRemoved, {
        theme: ctx.household.theme,
        householdName: ctx.household.name,
        recipientName: p.name,
        typeName: removed.typeName,
        total: removed.total,
        perPersonCost: removed.perPersonCost,
        dueDate: removed.dueDate,
        removedByName: ctx.user.name,
        isOwner,
      }),
      kind: "bill_removed",
      replyTo: owner?.email ?? null,
    });
    out[ok ? "sent" : "failed"]++;
    if (ok) sentTo.push(p.name);
  }
  await sendDigest(ctx, mail, {
    event: "bill_removed",
    actorName: ctx.user.name,
    typeName: removed.typeName,
    total: removed.total,
    perPersonCost: removed.perPersonCost,
    dueDate: removed.dueDate,
    sentTo,
    failed: out.failed,
  });
  return out;
}

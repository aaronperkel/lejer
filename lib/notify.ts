import { createElement } from "react";
import NewBill from "@/emails/NewBill";
import Reminder from "@/emails/Reminder";
import { type CreatedBill, getBill } from "@/lib/bills";
import { assertCanManage } from "@/lib/auth";
import type { Ctx } from "@/lib/context";
import { type Tx, withHousehold } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { sendMail } from "@/lib/mail";
import { daysBetween, localDate } from "@/lib/time";

// Household mail about bills. Recipients are members who have joined (signed in at least once):
// a pending invite's address hasn't been proven yet, so it gets nothing but the invite itself.
// Reply-To is the bill type's owner, so replying reaches the person being paid.

interface Recipient {
  id: number;
  name: string;
  email: string;
}

async function joinedSplitters(tx: Tx): Promise<Recipient[]> {
  return tx<Recipient[]>`
    SELECT m.id, u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.household_id = app_household_id() AND m.splits_bills AND m.joined_at IS NOT NULL`;
}

async function ownerEmail(tx: Tx, ownerId: number | null): Promise<string | null> {
  if (ownerId === null) return null;
  const [o] = await tx<{ email: string }[]>`
    SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ${ownerId}`;
  return o?.email ?? null;
}

export interface SendReport {
  sent: number;
  failed: number;
}

/** Tells every joined splitter about a new bill: debtors what they owe, the owner who owes them. */
export async function notifyNewBill(ctx: Ctx, bill: CreatedBill, dueDate: string, hasPdf: boolean): Promise<SendReport> {
  const { recipients, replyTo } = await withHousehold(ctx, async (tx) => ({
    recipients: await joinedSplitters(tx),
    replyTo: await ownerEmail(tx, bill.type.ownerId),
  }));
  const report = { sent: 0, failed: 0 };
  for (const r of recipients) {
    const isOwner = r.id === bill.type.ownerId;
    if (!isOwner && !bill.debtors.some((d) => d.id === r.id)) continue;
    const ok = await sendMail({
      ctx,
      to: r.email,
      subject: `New bill: ${bill.type.name}, $${bill.perPersonCost.toFixed(2)} ${isOwner ? "each owed to you" : "your share"}`,
      react: createElement(NewBill, {
        theme: ctx.household.theme,
        householdName: ctx.household.name,
        recipientName: r.name,
        typeName: bill.type.name,
        total: bill.total,
        perPersonCost: bill.perPersonCost,
        dueDate,
        ownerName: bill.type.ownerName,
        postedByName: ctx.user.name,
        isOwner,
        debtorNames: bill.debtors.map((d) => d.name),
        hasPdf,
      }),
      kind: "new_bill",
      replyTo,
    });
    report[ok ? "sent" : "failed"]++;
  }
  return report;
}

/**
 * Reminds everyone who still owes on one bill (the portal's per-bill button). Urgent within the
 * household's urgent window, counted in the household's own calendar.
 */
export async function remindBill(ctx: Ctx, billId: number): Promise<SendReport & { typeName: string }> {
  const { bill, debtors, replyTo } = await withHousehold(ctx, async (tx) => {
    const bill = await getBill(tx, billId);
    if (!bill) throw new ActionError("That bill no longer exists.");
    assertCanManage(ctx, bill.ownerId); // the bill's owner, not whoever owns its type today
    const debtors = await tx<Recipient[]>`
      SELECT m.id, u.name, u.email FROM bill_debts d
      JOIN memberships m ON m.id = d.person_id JOIN users u ON u.id = m.user_id
      WHERE d.bill_id = ${billId} AND d.paid_at IS NULL AND m.joined_at IS NOT NULL`;
    return { bill, debtors, replyTo: await ownerEmail(tx, bill.ownerId) };
  });
  if (debtors.length === 0) throw new ActionError(`Nobody who has joined still owes on the ${bill.typeName} bill.`);

  const days = daysBetween(localDate(ctx.household.timezone), bill.dueDate);
  const urgent = days <= ctx.household.urgentReminderDays;
  const report = { sent: 0, failed: 0, typeName: bill.typeName };
  for (const r of debtors) {
    const ok = await sendMail({
      ctx,
      to: r.email,
      subject: urgent ? `Due soon: your ${bill.typeName} share` : `Reminder: your ${bill.typeName} share`,
      react: createElement(Reminder, {
        theme: ctx.household.theme,
        householdName: ctx.household.name,
        recipientName: r.name,
        typeName: bill.typeName,
        total: bill.total,
        perPersonCost: bill.perPersonCost,
        dueDate: bill.dueDate,
        ownerName: bill.ownerId === null ? null : bill.ownerName, // no "pay a former member"
        urgent,
      }),
      kind: "reminder",
      replyTo,
    });
    report[ok ? "sent" : "failed"]++;
  }
  return report;
}

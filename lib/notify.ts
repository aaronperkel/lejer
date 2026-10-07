import { createElement } from "react";
import DigestCopy, { type DigestCopyProps, digestSubject } from "@/emails/DigestCopy";
import Reminder from "@/emails/Reminder";
import { getBill } from "@/lib/bills";
import { assertCanManage } from "@/lib/auth";
import type { Ctx } from "@/lib/context";
import { type Tx, withHousehold } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { sendMail } from "@/lib/mail";
import { daysBetween, localDate } from "@/lib/time";

// Per-bill reminders from the portal (new-bill, corrected and removed notices live in
// lib/notices.ts). Recipients are members who have joined (signed in at least once): a pending
// invite's address hasn't been proven yet, so it gets nothing but the invite itself. Reply-To is
// the bill's owner, so replying reaches the person being paid.

interface Recipient {
  id: number;
  name: string;
  email: string;
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

/** The digest copy for digest_email (when set): what went out about one bill, and to whom. */
async function sendDigest(ctx: Ctx, p: Omit<DigestCopyProps, "theme" | "householdName" | "actorName">): Promise<void> {
  const to = ctx.household.digestEmail;
  if (!to) return;
  await sendMail({
    ctx,
    to,
    subject: digestSubject(p.event, p.typeName, p.sentTo.length),
    react: createElement(DigestCopy, { ...p, theme: ctx.household.theme, householdName: ctx.household.name, actorName: ctx.user.name }),
    kind: "digest",
  });
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
  const overdue = days < 0;
  const report = { sent: 0, failed: 0, typeName: bill.typeName };
  const sentTo: string[] = [];
  for (const r of debtors) {
    const ok = await sendMail({
      ctx,
      to: r.email,
      subject: overdue ? `Past due: your ${bill.typeName} share` : urgent ? `Due soon: your ${bill.typeName} share` : `Reminder: your ${bill.typeName} share`,
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
        overdue,
      }),
      kind: "reminder",
      replyTo,
    });
    report[ok ? "sent" : "failed"]++;
    if (ok) sentTo.push(r.name);
  }
  await sendDigest(ctx, {
    event: "reminder",
    typeName: bill.typeName,
    total: bill.total,
    perPersonCost: bill.perPersonCost,
    dueDate: bill.dueDate,
    sentTo,
    failed: report.failed,
  });
  return report;
}

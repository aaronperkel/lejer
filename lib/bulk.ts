import { createElement } from "react";
import BulkReceipt from "@/emails/BulkReceipt";
import CustomNote from "@/emails/CustomNote";
import { assertAdmin } from "@/lib/auth";
import type { Ctx } from "@/lib/context";
import { type Tx, withHousehold } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { BULK_DAILY_LIMIT, type Mailer, mailer as defaultMailer, sendsToday } from "@/lib/mail";
import { nextUtcMidnight } from "@/lib/time";

// Bulk email (/portal/email, feature_bulk_email): an admin's note to every member who has joined.
// It's optional and reminders aren't, so it stops at BULK_DAILY_LIMIT account-wide sends for the
// UTC day (ARCHITECTURE.md §6), leaving headroom for the reminder batch and login codes.

export const SUBJECT_MAX = 150;
export const BODY_MAX = 10_000;

export interface BulkRecipient {
  name: string;
  email: string;
}

/** Joined members, the sender included; pending invites get nothing until they sign in. */
export async function bulkRecipients(tx: Tx): Promise<{ joined: BulkRecipient[]; pending: string[] }> {
  const rows = await tx<(BulkRecipient & { joined: boolean })[]>`
    SELECT u.name, u.email, m.joined_at IS NOT NULL AS joined
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.household_id = app_household_id()
    ORDER BY u.name`;
  return { joined: rows.filter((r) => r.joined), pending: rows.filter((r) => !r.joined).map((r) => r.name) };
}

export interface BulkReport {
  sentTo: string[];
  failedTo: string[];
}

export async function sendBulkEmail(
  ctx: Ctx,
  raw: { subject: string; body: string },
  opts: { now?: Date; mailer?: Mailer } = {},
): Promise<BulkReport> {
  assertAdmin(ctx);
  if (!ctx.household.featureBulkEmail) throw new ActionError("Bulk email is turned off for this household.");
  const subject = raw.subject.trim();
  const body = raw.body.trim();
  const errors: string[] = [];
  if (!subject) errors.push("Add a subject.");
  else if (subject.length > SUBJECT_MAX) errors.push(`Keep the subject to ${SUBJECT_MAX} characters.`);
  if (!body) errors.push("Write the message.");
  else if (body.length > BODY_MAX) errors.push(`Keep the message to ${BODY_MAX.toLocaleString("en-US")} characters.`);
  if (errors.length) throw new ActionError(errors.join("\n"));

  const now = opts.now ?? new Date();
  const mail = opts.mailer ?? defaultMailer;
  const { recipients, used } = await withHousehold(ctx, async (tx) => ({
    recipients: (await bulkRecipients(tx)).joined,
    used: await sendsToday(tx, now),
  }));
  if (recipients.length === 0) throw new ActionError("Nobody in the household has signed in yet, so there's no one to email.");

  const batch = recipients.length + (ctx.household.digestEmail ? 1 : 0);
  if (used + batch > BULK_DAILY_LIMIT) {
    const { local } = nextUtcMidnight(ctx.household.timezone, now);
    throw new ActionError(
      `Today's email allowance is nearly used up, and what's left is saved for reminders and sign-in codes. Try again after ${local} (${ctx.household.timezone.replaceAll("_", " ")} time).`,
    );
  }

  const report: BulkReport = { sentTo: [], failedTo: [] };
  for (const r of recipients) {
    const ok = await mail.send({
      ctx,
      to: r.email,
      subject,
      react: createElement(CustomNote, { theme: ctx.household.theme, householdName: ctx.household.name, householdSlug: ctx.household.slug, senderName: ctx.user.name, subject, body }),
      kind: "custom",
      replyTo: ctx.user.email, // replies reach the person who wrote it
    });
    (ok ? report.sentTo : report.failedTo).push(r.name);
  }

  if (ctx.household.digestEmail && report.sentTo.length) {
    await mail.send({
      ctx,
      to: ctx.household.digestEmail,
      subject: `Bulk email sent: ${subject}`,
      react: createElement(BulkReceipt, {
        theme: ctx.household.theme,
        householdName: ctx.household.name,
        householdSlug: ctx.household.slug,
        senderName: ctx.user.name,
        subject,
        body,
        sentTo: report.sentTo,
        failedTo: report.failedTo,
      }),
      kind: "bulk_receipt",
    });
  }
  return report;
}

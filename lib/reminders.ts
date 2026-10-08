import { createElement } from "react";
import BatchConfirmation from "@/emails/BatchConfirmation";
import Reminder from "@/emails/Reminder";
import type { Tx } from "@/lib/db";
import type { SendMailArgs } from "@/lib/mail";
import { daysBetween } from "@/lib/time";
import type { Household } from "@/lib/types";

// Who gets a reminder today (ARCHITECTURE.md §8), shared by the cron tick and the CLI. For each
// unpaid debt row of a member who has joined, with `days` = due date minus the household's today:
// - days = first_reminder_days        → the heads-up;
// - 0 ≤ days ≤ urgent_reminder_days    → urgent, every day through the due date;
// - overdue                            → urgent on overdue days 1, 4, 7, … (OVERDUE_EVERY_DAYS).
// Once a bill is late it slows down rather than nagging daily; the portal's per-bill button is
// there for a nudge in between.

export const OVERDUE_EVERY_DAYS = 3;

export type ReminderLevel = "heads_up" | "urgent" | "overdue";

/** Which reminder (if any) a debt `days` from due gets today. */
export function reminderLevel(days: number, h: Pick<Household, "firstReminderDays" | "urgentReminderDays">): ReminderLevel | null {
  if (days < 0) return (-days - 1) % OVERDUE_EVERY_DAYS === 0 ? "overdue" : null;
  if (days <= h.urgentReminderDays) return "urgent";
  if (days === h.firstReminderDays) return "heads_up";
  return null;
}

export interface DueReminder {
  billId: number;
  personId: number;
  name: string;
  email: string;
  typeName: string;
  total: number;
  perPersonCost: number;
  dueDate: string;
  ownerName: string | null;
  ownerEmail: string | null;
  level: ReminderLevel;
}

/** Today's reminders for the transaction's household, in due-date order. */
export async function dueReminders(tx: Tx, h: Household, today: string): Promise<DueReminder[]> {
  const rows = await tx<Omit<DueReminder, "level">[]>`
    SELECT b.id AS "billId", d.person_id AS "personId", u.name, u.email,
           t.name AS "typeName", b.total, b.per_person_cost AS "perPersonCost", b.due_date AS "dueDate",
           ou.name AS "ownerName", ou.email AS "ownerEmail"
    FROM bill_debts d
    JOIN bills b ON b.id = d.bill_id
    JOIN bill_types t ON t.id = b.type_id
    JOIN memberships m ON m.id = d.person_id
    JOIN users u ON u.id = m.user_id
    LEFT JOIN memberships om ON om.id = b.owner_id
    LEFT JOIN users ou ON ou.id = om.user_id
    WHERE d.paid_at IS NULL AND m.joined_at IS NOT NULL
      AND b.due_date <= ${today}::date + ${Math.max(h.firstReminderDays, h.urgentReminderDays)}::int
    ORDER BY b.due_date, t.name, u.name`;
  return rows.flatMap((r) => {
    const level = reminderLevel(daysBetween(today, r.dueDate), h);
    return level ? [{ ...r, level }] : [];
  });
}

/** One reminder email. Reply-To is the bill's owner, so replying reaches the person being paid. */
export function reminderMessage(h: Household, r: Omit<DueReminder, "personId">): Omit<SendMailArgs, "ctx"> {
  const subject =
    r.level === "overdue" ? `Past due: your ${r.typeName} share` : r.level === "urgent" ? `Due soon: your ${r.typeName} share` : `Reminder: your ${r.typeName} share`;
  return {
    to: r.email,
    subject,
    react: createElement(Reminder, {
      theme: h.theme,
      householdName: h.name,
      householdSlug: h.slug,
      recipientName: r.name,
      typeName: r.typeName,
      total: r.total,
      perPersonCost: r.perPersonCost,
      dueDate: r.dueDate,
      ownerName: r.ownerName, // null for a removed owner: no "pay a former member"
      urgent: r.level !== "heads_up",
      overdue: r.level === "overdue",
    }),
    kind: "reminder",
    replyTo: r.ownerEmail,
  };
}

/** The batch's digest copy for digest_email. */
export function batchConfirmationMessage(h: Household, today: string, sent: DueReminder[], failed: number): Omit<SendMailArgs, "ctx"> {
  return {
    to: h.digestEmail!,
    subject: `Reminder batch: ${sent.length} sent${failed ? `, ${failed} didn't send` : ""}`,
    react: createElement(BatchConfirmation, {
      theme: h.theme,
      householdName: h.name,
      householdSlug: h.slug,
      date: today,
      sent: sent.map((s) => ({ name: s.name, typeName: s.typeName, urgent: s.level !== "heads_up" })),
      failed,
    }),
    kind: "batch_confirmation",
  };
}

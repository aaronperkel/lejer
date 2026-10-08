import { createElement } from "react";
import Thanks from "@/emails/Thanks";
import { type TenantScope, withHousehold } from "@/lib/db";
import { type Mailer, mailer as defaultMailer } from "@/lib/mail";
import type { Household } from "@/lib/types";

// Debounced "payment recorded" receipts (feature_thanks). Checking someone off (setPaid in
// lib/bills.ts) queues a payment_thanks row instead of mailing; unchecking deletes it, and
// re-checking restarts the clock. A person's queue goes out as ONE email once their newest row
// has sat for THANKS_DELAY_MINUTES: the delay is the undo window for a misclick, and the
// newest-row rule folds a burst of check-offs into a single receipt. Flushed by every cron tick
// and, through after(), by every payment edit.

export const THANKS_DELAY_MINUTES = 10;

export interface ThanksResult {
  sent: number;
  failed: number;
  /** Rows still inside their undo window. */
  pending: number;
}

interface Claimed {
  billId: number;
  personId: number;
  queuedAt: Date;
  name: string;
  email: string;
  joined: boolean;
  typeName: string;
  dueDate: string;
  perPersonCost: number;
  ownerName: string | null;
}

/**
 * Sends every settled receipt in the scope's household. Rows are claimed with one
 * DELETE … RETURNING, so concurrent flushers (a tick and an after()) never send the same
 * receipt twice; a send that fails puts its rows back with their original times, so it goes out
 * on the next flush. Pending invites get nothing (their address isn't proven), and their rows
 * are simply dropped.
 */
export async function flushThanks(
  scope: TenantScope & { household: Household },
  opts: { now?: Date; mailer?: Mailer } = {},
): Promise<ThanksResult> {
  if (!scope.household.featureThanks) return { sent: 0, failed: 0, pending: 0 };
  const cutoff = new Date((opts.now ?? new Date()).getTime() - THANKS_DELAY_MINUTES * 60_000);
  const mail = opts.mailer ?? defaultMailer;

  const claimed = await withHousehold(scope, (tx) => tx<Claimed[]>`
    WITH claimed AS (
      DELETE FROM payment_thanks
      WHERE person_id IN (
        SELECT person_id FROM payment_thanks GROUP BY person_id HAVING max(queued_at) <= ${cutoff})
      RETURNING bill_id, person_id, queued_at)
    SELECT c.bill_id AS "billId", c.person_id AS "personId", c.queued_at AS "queuedAt",
           u.name, u.email, m.joined_at IS NOT NULL AS joined,
           t.name AS "typeName", b.due_date AS "dueDate", b.per_person_cost AS "perPersonCost",
           ou.name AS "ownerName"
    FROM claimed c
    JOIN memberships m ON m.id = c.person_id
    JOIN users u ON u.id = m.user_id
    JOIN bills b ON b.id = c.bill_id
    JOIN bill_types t ON t.id = b.type_id
    JOIN bill_debts d ON d.bill_id = c.bill_id AND d.person_id = c.person_id AND d.paid_at IS NOT NULL
    LEFT JOIN memberships om ON om.id = b.owner_id
    LEFT JOIN users ou ON ou.id = om.user_id
    ORDER BY b.due_date, t.name`);

  const byPerson = new Map<number, Claimed[]>();
  for (const row of claimed) if (row.joined) byPerson.set(row.personId, [...(byPerson.get(row.personId) ?? []), row]);

  const result: ThanksResult = { sent: 0, failed: 0, pending: 0 };
  for (const rows of byPerson.values()) {
    const [first] = rows;
    const names = rows.map((r) => r.typeName);
    const ok = await mail.send({
      ctx: scope,
      to: first.email,
      subject: `Payment recorded: ${names.join(", ")}`,
      react: createElement(Thanks, {
        theme: scope.household.theme,
        householdName: scope.household.name,
        householdSlug: scope.household.slug,
        recipientName: first.name,
        bills: rows.map((r) => ({ typeName: r.typeName, dueDate: r.dueDate, perPersonCost: r.perPersonCost, ownerName: r.ownerName })),
      }),
      kind: "thanks",
    });
    if (ok) {
      result.sent++;
      continue;
    }
    result.failed++;
    // Back in the queue with the original times (due again next flush). A row re-queued in the
    // meantime keeps its newer time: that check-off restarted the undo window.
    await withHousehold(scope, (tx) => tx`
      INSERT INTO payment_thanks ${tx(
        rows.map((r) => ({ household_id: scope.household.id, bill_id: r.billId, person_id: r.personId, queued_at: r.queuedAt })),
        "household_id", "bill_id", "person_id", "queued_at",
      )}
      ON CONFLICT (bill_id, person_id) DO NOTHING`);
  }

  const [{ n }] = await withHousehold(scope, (tx) => tx<{ n: number }[]>`SELECT count(*) AS n FROM payment_thanks`);
  result.pending = n;
  return result;
}

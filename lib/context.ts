import { cache } from "react";
import { connection } from "next/server";
import { withUser } from "@/lib/db";
import type { Household, Membership, User } from "@/lib/types";

export interface Ctx {
  user: User;
  membership: Membership;
  household: Household;
  demo: boolean;
}

/**
 * Resolves the request to { user, membership, household } once per request, or null.
 * Phase 1 only knows the dev bypass; the session cookie and /demo arrive in phase 2.
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  await connection(); // per-request, never prerendered (phase 2 reads the cookie instead)
  const email = process.env.APP_DEV_USER;
  const slug = process.env.APP_DEV_HOUSEHOLD;
  if (process.env.VERCEL_ENV === "production" || !email || !slug) return null;
  return resolve(email, slug);
});

async function resolve(email: string, slug: string): Promise<Ctx | null> {
  const [user] = await withUser(null, (tx) => tx<User[]>`
    SELECT id, email, name FROM users WHERE email = ${email}`);
  if (!user) return null;

  // households_read/memberships_read admit the user's own rows with only app.user_id set.
  return withUser(user.id, async (tx) => {
    const [household] = await tx<Household[]>`
      SELECT id, slug, name, tagline, mode, theme, color_scheme AS "colorScheme", timezone,
             ask_bill_date AS "askBillDate", bills_per_page AS "billsPerPage",
             feature_rent AS "featureRent", feature_trends AS "featureTrends",
             feature_bulk_email AS "featureBulkEmail", feature_documents AS "featureDocuments",
             feature_welcome_tour AS "featureWelcomeTour", feature_thanks AS "featureThanks",
             monthly_rent AS "monthlyRent", lease_start AS "leaseStart", lease_end AS "leaseEnd",
             reminders_enabled AS "remindersEnabled", send_hour AS "sendHour",
             first_reminder_days AS "firstReminderDays", urgent_reminder_days AS "urgentReminderDays",
             from_name AS "fromName", reply_to AS "replyTo", digest_email AS "digestEmail"
      FROM households WHERE slug = ${slug}`;
    if (!household) return null;
    const [membership] = await tx<Membership[]>`
      SELECT id, household_id AS "householdId", user_id AS "userId", role,
             splits_bills AS "splitsBills", welcomed_at AS "welcomedAt", joined_at AS "joinedAt"
      FROM memberships WHERE household_id = ${household.id} AND user_id = ${user.id}`;
    if (!membership) return null;
    return { user, membership, household, demo: false };
  });
}

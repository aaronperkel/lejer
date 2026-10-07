import { adminSql, type Tx } from "@/lib/db";
import type { ColorScheme, Household, HouseholdMode, Membership, ReminderRun, Theme, User } from "@/lib/types";

// Households, memberships and the switcher list. Every function takes the caller's tx except
// createHousehold(), which is one of the four owner-role call sites (CLAUDE.md): a new user has
// no household for app.household_id to name, so RLS could never admit the insert.

const householdColumns = (tx: Tx) => tx`
  h.id, h.slug, h.name, h.tagline, h.mode, h.theme, h.color_scheme AS "colorScheme", h.timezone,
  h.ask_bill_date AS "askBillDate", h.bills_per_page AS "billsPerPage",
  h.feature_rent AS "featureRent", h.feature_trends AS "featureTrends",
  h.feature_bulk_email AS "featureBulkEmail", h.feature_documents AS "featureDocuments",
  h.feature_welcome_tour AS "featureWelcomeTour", h.feature_thanks AS "featureThanks",
  h.monthly_rent AS "monthlyRent", h.lease_start AS "leaseStart", h.lease_end AS "leaseEnd",
  h.reminders_enabled AS "remindersEnabled", h.send_hour AS "sendHour",
  h.first_reminder_days AS "firstReminderDays", h.urgent_reminder_days AS "urgentReminderDays",
  h.from_name AS "fromName", h.reply_to AS "replyTo", h.digest_email AS "digestEmail"`;

const membershipColumns = (tx: Tx) => tx`
  m.id, m.household_id AS "householdId", m.user_id AS "userId", m.role,
  m.splits_bills AS "splitsBills", m.welcomed_at AS "welcomedAt", m.joined_at AS "joinedAt"`;

/**
 * The user's membership + household: the one with householdId if given and still valid,
 * otherwise their first (joined before pending, then oldest). Runs under withUser, where
 * memberships_read/households_read admit the user's own rows.
 */
export async function findMembership(
  tx: Tx,
  userId: number,
  householdId: number | null,
): Promise<{ membership: Membership; household: Household } | null> {
  const [membership] = await tx<Membership[]>`
    SELECT ${membershipColumns(tx)} FROM memberships m
    WHERE m.user_id = ${userId}
    ORDER BY (m.household_id = ${householdId ?? -1}) DESC, (m.joined_at IS NULL), m.id
    LIMIT 1`;
  if (!membership) return null;
  const [household] = await tx<Household[]>`
    SELECT ${householdColumns(tx)} FROM households h WHERE h.id = ${membership.householdId}`;
  return household ? { membership, household } : null;
}

/** The household by slug (dev bypass). Under withUser: only the user's own households match. */
export async function findMembershipBySlug(
  tx: Tx,
  userId: number,
  slug: string,
): Promise<{ membership: Membership; household: Household } | null> {
  const [h] = await tx<{ id: number }[]>`SELECT id FROM households WHERE slug = ${slug}`;
  if (!h) return null;
  const found = await findMembership(tx, userId, h.id);
  return found?.household.id === h.id ? found : null;
}

/**
 * The household this transaction is scoped to (app.household_id), with the cron's bookkeeping.
 * For system scopes that start from an id (the cron, the CLI) and for the settings readout.
 */
export async function getCurrentHousehold(tx: Tx): Promise<(Household & ReminderRun) | null> {
  const [household] = await tx<(Household & ReminderRun)[]>`
    SELECT ${householdColumns(tx)},
      h.last_run_at AS "lastRunAt", h.last_send_date AS "lastSendDate",
      h.last_sent_at AS "lastSentAt", h.last_sent_count AS "lastSentCount"
    FROM households h WHERE h.id = app_household_id()`;
  return household ?? null;
}

export async function getUserByEmail(tx: Tx, email: string): Promise<User | null> {
  const [user] = await tx<User[]>`SELECT id, email, name FROM users WHERE email = ${email}`;
  return user ?? null;
}

export async function getUserById(tx: Tx, id: number): Promise<User | null> {
  const [user] = await tx<User[]>`SELECT id, email, name FROM users WHERE id = ${id}`;
  return user ?? null;
}

export interface MyHousehold {
  id: number;
  slug: string;
  name: string;
  role: Membership["role"];
  joinedAt: Date | null;
}

/** Every household the user belongs to, for the switcher and nav. Under withUser. */
export async function listMyHouseholds(tx: Tx, userId: number): Promise<MyHousehold[]> {
  return tx<MyHousehold[]>`
    SELECT h.id, h.slug, h.name, m.role, m.joined_at AS "joinedAt"
    FROM memberships m JOIN households h ON h.id = m.household_id
    WHERE m.user_id = ${userId}
    ORDER BY h.name, h.id`;
}

/** Marks a pending invite accepted. Must run in withHousehold for that household. */
export async function markJoined(tx: Tx, membershipId: number): Promise<void> {
  await tx`UPDATE memberships SET joined_at = now() WHERE id = ${membershipId} AND joined_at IS NULL`;
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/#/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "household"
  );
}

export interface NewHousehold {
  userId: number;
  email: string; // seeds reply_to
  name: string;
  mode: HouseholdMode;
  theme: Theme;
  timezone: string;
}

/**
 * Signup: household + its first admin membership in one owner-role transaction. The wizard's
 * choices drive the defaults: ask_bill_date on for single_payer, peach is light-only.
 */
export async function createHousehold(h: NewHousehold): Promise<{ id: number; slug: string }> {
  const base = slugify(h.name);
  const colorScheme: ColorScheme = h.theme === "peach" ? "light" : "system";
  return adminSql().begin(async (tx) => {
    for (let n = 1; n <= 50; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const [row] = await tx<{ id: number }[]>`
        INSERT INTO households (slug, name, mode, theme, color_scheme, timezone, ask_bill_date, reply_to)
        VALUES (${slug}, ${h.name}, ${h.mode}, ${h.theme}, ${colorScheme}, ${h.timezone},
                ${h.mode === "single_payer"}, ${h.email})
        ON CONFLICT (slug) DO NOTHING
        RETURNING id`;
      if (!row) continue;
      await tx`
        INSERT INTO memberships (household_id, user_id, role, joined_at)
        VALUES (${row.id}, ${h.userId}, 'admin', now())`;
      return { id: row.id, slug };
    }
    throw new Error(`no free slug for "${base}"`);
  }) as Promise<{ id: number; slug: string }>;
}

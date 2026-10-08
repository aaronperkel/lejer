import { assertAdmin } from "@/lib/auth";
import type { Ctx } from "@/lib/context";
import type { Tx } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { FEATURES, type Feature, hasFeature } from "@/lib/features";
import { normalizeEmail } from "@/lib/login-codes";
import { BILLS_PER_PAGE, NAME_MAX, type SettingsForm, TAGLINE_MAX } from "@/lib/settings-form";
import type { ColorScheme, Household, HouseholdMode, Theme } from "@/lib/types";

// /{slug}/household/settings, every group (ARCHITECTURE.md §7): household and mode, look, features and
// rent, bills, the reminder schedule, the timezone, and email identity. One form, one save.

export { BILLS_PER_PAGE, NAME_MAX, TAGLINE_MAX, type SettingsForm } from "@/lib/settings-form";

export interface SettingsInput {
  name: string;
  tagline: string | null;
  mode: HouseholdMode;
  /** single_payer only: the membership that owns every bill type after saving. */
  payerId: number | null;
  theme: Theme;
  colorScheme: ColorScheme;
  features: Record<Feature, boolean>;
  monthlyRent: number | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  askBillDate: boolean;
  billsPerPage: number;
  remindersEnabled: boolean;
  sendHour: number;
  firstReminderDays: number;
  urgentReminderDays: number;
  timezone: string;
  fromName: string | null;
  replyTo: string | null;
  digestEmail: string | null;
}

export const FROM_NAME_MAX = 60;

const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);

/** Empty means "none"; anything else has to be a real address (normalizeEmail returns null if not). */
function optionalEmail(raw: string, label: string, errors: string[]): string | null {
  if (!raw.trim()) return null;
  const email = normalizeEmail(raw);
  if (!email) errors.push(`${label} doesn't look like an email address.`);
  return email;
}

/** A real calendar date as YYYY-MM-DD, or null for empty; anything else is an error. */
function optionalDate(raw: string, label: string, errors: string[]): string | null {
  const v = raw.trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    errors.push(`${label} isn't a date.`);
    return null;
  }
  return v;
}

/** Every problem at once, so the form can list them; throws only when there is at least one. */
export function parseSettings(f: SettingsForm): SettingsInput {
  const errors: string[] = [];

  const name = f.name.trim();
  if (!name || name.length > NAME_MAX) errors.push(`Name the household (up to ${NAME_MAX} characters).`);
  const tagline = f.tagline.trim();
  if (tagline.length > TAGLINE_MAX) errors.push(`Keep the tagline to ${TAGLINE_MAX} characters.`);

  const mode = f.mode as HouseholdMode;
  if (mode !== "single_payer" && mode !== "ledger") errors.push("Pick how the household splits bills.");
  const payerId = whole(f.payerId);
  if (mode === "single_payer" && !(payerId > 0)) errors.push("Pick who pays every bill.");

  const theme = f.theme as Theme;
  if (theme !== "statement" && theme !== "peach") errors.push("Pick a theme.");
  // Peach is light-only; statement offers system (follows the device) or light.
  const colorScheme: ColorScheme = theme === "peach" ? "light" : (f.colorScheme as ColorScheme);
  if (colorScheme !== "system" && colorScheme !== "light") errors.push("Pick light or match the device.");

  const billsPerPage = whole(f.billsPerPage);
  if (!(BILLS_PER_PAGE as readonly number[]).includes(billsPerPage)) errors.push("Pick how many bills to show per page.");

  // Rent: optional figures, kept even while the feature is off so turning it back on restores them.
  let monthlyRent: number | null = null;
  const rentRaw = f.monthlyRent.replace(/[$,\s]/g, "");
  if (rentRaw) {
    monthlyRent = /^\d+(\.\d{1,2})?$/.test(rentRaw) ? Number(rentRaw) : NaN;
    if (!(monthlyRent >= 0 && monthlyRent < 100000)) errors.push("Monthly rent should be an amount like 1450 or 1450.00.");
  }
  const leaseStart = optionalDate(f.leaseStart, "The lease start", errors);
  const leaseEnd = optionalDate(f.leaseEnd, "The lease end", errors);
  if (leaseStart && leaseEnd && leaseEnd < leaseStart) errors.push("The lease has to end after it starts.");

  const sendHour = whole(f.sendHour);
  const first = whole(f.firstReminderDays);
  const urgent = whole(f.urgentReminderDays);
  if (!(sendHour >= 0 && sendHour <= 23)) errors.push("Pick a send time from the list.");
  if (!(first >= 1 && first <= 30)) errors.push("The heads-up has to be 1 to 30 days before the due date.");
  if (!(urgent >= 0 && urgent <= 30)) errors.push("Daily reminders can start 0 to 30 days before the due date.");
  else if (first >= 1 && urgent >= first) errors.push("Daily reminders have to start after the heads-up, so pick fewer days for them.");

  const timezone = f.timezone.trim();
  if (timezone !== "UTC" && !Intl.supportedValuesOf("timeZone").includes(timezone)) errors.push("Pick a time zone from the list.");

  // Display names can't carry quotes or angle brackets (lib/mail.ts strips them too).
  const fromName = f.fromName.replace(/["<>\\]/g, "").trim();
  if (fromName.length > FROM_NAME_MAX) errors.push(`Keep the sender name to ${FROM_NAME_MAX} characters.`);

  const replyTo = optionalEmail(f.replyTo, "The reply-to address", errors);
  const digestEmail = optionalEmail(f.digestEmail, "The digest address", errors);

  if (errors.length) throw new ActionError(errors.join("\n"));
  return {
    name,
    tagline: tagline || null,
    mode,
    payerId: mode === "single_payer" ? payerId : null,
    theme,
    colorScheme,
    features: Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((k) => [k, f.features[k] === true])) as Record<Feature, boolean>,
    monthlyRent,
    leaseStart,
    leaseEnd,
    askBillDate: f.askBillDate,
    billsPerPage,
    remindersEnabled: f.remindersEnabled,
    sendHour,
    firstReminderDays: first,
    urgentReminderDays: urgent,
    timezone,
    fromName: fromName || null,
    replyTo,
    digestEmail,
  };
}

/**
 * Admins only. The claim on today's batch (last_send_date) is left alone: see ARCHITECTURE.md §8.
 *
 * Mode (ARCHITECTURE.md §3): single_payer means every bill type belongs to one person, so saving
 * it bulk-sets every type's owner to the chosen payer (also when already in single_payer, which
 * is how the payer changes). ledger only changes the mode; the owners stay as they are and the
 * owner column reappears. Bills are never touched in either direction: each keeps the owner it
 * was posted with (bills.owner_id), so debts already owed still run to whoever fronted them.
 * Returns how many types changed hands.
 */
export async function saveSettings(tx: Tx, ctx: Ctx, input: SettingsInput): Promise<{ typesReassigned: number }> {
  if (ctx.demo) throw new ActionError(DEMO_REFUSAL);
  assertAdmin(ctx);
  let typesReassigned = 0;
  if (input.mode === "single_payer") {
    const [payer] = await tx<{ id: number }[]>`SELECT id FROM memberships WHERE id = ${input.payerId} AND household_id = app_household_id()`;
    if (!payer) throw new ActionError("Pick who pays from this household's members.");
    const moved = await tx`
      UPDATE bill_types SET owner_id = ${payer.id}
      WHERE household_id = app_household_id() AND owner_id IS DISTINCT FROM ${payer.id}`;
    typesReassigned = moved.count;
  }
  const f = input.features;
  await tx`
    UPDATE households SET
      name = ${input.name}, tagline = ${input.tagline}, mode = ${input.mode},
      theme = ${input.theme}, color_scheme = ${input.colorScheme},
      feature_rent = ${f.rent}, feature_trends = ${f.trends}, feature_bulk_email = ${f.bulkEmail},
      feature_documents = ${f.documents}, feature_welcome_tour = ${f.welcomeTour}, feature_thanks = ${f.thanks},
      monthly_rent = ${input.monthlyRent}, lease_start = ${input.leaseStart}, lease_end = ${input.leaseEnd},
      ask_bill_date = ${input.askBillDate}, bills_per_page = ${input.billsPerPage},
      reminders_enabled = ${input.remindersEnabled}, send_hour = ${input.sendHour},
      first_reminder_days = ${input.firstReminderDays}, urgent_reminder_days = ${input.urgentReminderDays},
      timezone = ${input.timezone},
      from_name = ${input.fromName}, reply_to = ${input.replyTo}, digest_email = ${input.digestEmail}
    WHERE id = app_household_id()`;
  return { typesReassigned };
}

/** The form as the household stands now (the page's initial values, and the verify suites'). */
export function settingsFormFrom(h: Household, payerId: number | null): SettingsForm {
  return {
    name: h.name,
    tagline: h.tagline ?? "",
    mode: h.mode,
    payerId: payerId === null ? "" : String(payerId),
    theme: h.theme,
    colorScheme: h.colorScheme,
    features: Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((k) => [k, hasFeature(h, k)])) as Record<Feature, boolean>,
    monthlyRent: h.monthlyRent === null ? "" : h.monthlyRent.toFixed(2),
    leaseStart: h.leaseStart ?? "",
    leaseEnd: h.leaseEnd ?? "",
    askBillDate: h.askBillDate,
    billsPerPage: String(h.billsPerPage),
    remindersEnabled: h.remindersEnabled,
    sendHour: String(h.sendHour),
    firstReminderDays: String(h.firstReminderDays),
    urgentReminderDays: String(h.urgentReminderDays),
    timezone: h.timezone,
    fromName: h.fromName ?? "",
    replyTo: h.replyTo ?? "",
    digestEmail: h.digestEmail ?? "",
  };
}

/** The submitted form. Checkboxes arrive only when ticked; feature boxes are named feature_<key>. */
export function settingsFormFromData(fd: FormData): SettingsForm {
  const str = (k: string) => String(fd.get(k) ?? "");
  return {
    name: str("name"),
    tagline: str("tagline"),
    mode: str("mode"),
    payerId: str("payerId"),
    theme: str("theme"),
    colorScheme: str("colorScheme"),
    features: Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((k) => [k, fd.get(`feature_${k}`) === "on"])) as Record<Feature, boolean>,
    monthlyRent: str("monthlyRent"),
    leaseStart: str("leaseStart"),
    leaseEnd: str("leaseEnd"),
    askBillDate: fd.get("askBillDate") === "on",
    billsPerPage: str("billsPerPage"),
    remindersEnabled: fd.get("remindersEnabled") === "on",
    sendHour: str("sendHour"),
    firstReminderDays: str("firstReminderDays"),
    urgentReminderDays: str("urgentReminderDays"),
    timezone: str("timezone"),
    fromName: str("fromName"),
    replyTo: str("replyTo"),
    digestEmail: str("digestEmail"),
  };
}

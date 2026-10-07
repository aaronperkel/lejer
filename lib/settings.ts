import { assertAdmin } from "@/lib/auth";
import type { Ctx } from "@/lib/context";
import type { Tx } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/login-codes";

// /portal/settings, phase 4's groups: the reminder schedule, the timezone, and email identity.
// Feature toggles, look, bills and rent arrive in phase 5. Rules follow utilities' reminder form.

/** The form's raw fields, echoed back on an error so nothing typed is lost. */
export interface SettingsForm {
  remindersEnabled: boolean;
  sendHour: string;
  firstReminderDays: string;
  urgentReminderDays: string;
  timezone: string;
  fromName: string;
  replyTo: string;
  digestEmail: string;
}

export interface SettingsInput {
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

/** Every problem at once, so the form can list them; throws only when there is at least one. */
export function parseSettings(f: SettingsForm): SettingsInput {
  const errors: string[] = [];
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

/** Admins only. The claim on today's batch (last_send_date) is left alone: see ARCHITECTURE.md §8. */
export async function saveSettings(tx: Tx, ctx: Ctx, input: SettingsInput): Promise<void> {
  if (ctx.demo) throw new ActionError(DEMO_REFUSAL);
  assertAdmin(ctx);
  await tx`
    UPDATE households SET
      reminders_enabled = ${input.remindersEnabled}, send_hour = ${input.sendHour},
      first_reminder_days = ${input.firstReminderDays}, urgent_reminder_days = ${input.urgentReminderDays},
      timezone = ${input.timezone},
      from_name = ${input.fromName}, reply_to = ${input.replyTo}, digest_email = ${input.digestEmail}
    WHERE id = app_household_id()`;
}

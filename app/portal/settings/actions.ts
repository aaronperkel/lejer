"use server";

import { assertAdmin, requireUserAction } from "@/lib/auth";
import { withHousehold } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { done } from "@/lib/flash";
import { type SettingsForm, parseSettings, saveSettings } from "@/lib/settings";

export interface SettingsState {
  errors: string[];
  values?: SettingsForm;
}

const SETTINGS = "/portal/settings";

/** useActionState: errors come back inline with what was typed; success redirects with ?ok=. */
export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const values: SettingsForm = {
    remindersEnabled: formData.get("remindersEnabled") === "on",
    sendHour: String(formData.get("sendHour") ?? ""),
    firstReminderDays: String(formData.get("firstReminderDays") ?? ""),
    urgentReminderDays: String(formData.get("urgentReminderDays") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
    fromName: String(formData.get("fromName") ?? ""),
    replyTo: String(formData.get("replyTo") ?? ""),
    digestEmail: String(formData.get("digestEmail") ?? ""),
  };
  try {
    const ctx = await requireUserAction();
    if (ctx.demo) return { errors: [DEMO_REFUSAL], values };
    assertAdmin(ctx);
    const input = parseSettings(values);
    await withHousehold(ctx, (tx) => saveSettings(tx, ctx, input));
  } catch (e) {
    if (e instanceof ActionError) return { errors: e.message.split("\n"), values };
    throw e;
  }
  done(SETTINGS, "Settings saved.");
}

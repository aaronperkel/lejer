"use server";

import { assertAdmin, requireUserAction } from "@/lib/auth";
import { withHousehold } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { done } from "@/lib/flash";
import { householdPath } from "@/lib/paths";
import { type SettingsForm, parseSettings, saveSettings, settingsFormFromData } from "@/lib/settings";

export interface SettingsState {
  errors: string[];
  values?: SettingsForm;
}

/** useActionState: errors come back inline with what was typed; success redirects with ?ok=. */
export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const values = settingsFormFromData(formData);
  let message: string;
  let back: string;
  try {
    const ctx = await requireUserAction();
    back = householdPath(ctx.household, "/portal/settings");
    if (ctx.demo) return { errors: [DEMO_REFUSAL], values };
    assertAdmin(ctx);
    const input = parseSettings(values);
    const { typesReassigned } = await withHousehold(ctx, (tx) => saveSettings(tx, ctx, input));
    message =
      input.mode !== ctx.household.mode
        ? input.mode === "single_payer"
          ? `Settings saved. ${input.name} is single payer now; bills already posted keep their owner.`
          : `Settings saved. ${input.name} keeps a ledger now; each bill type shows its owner.`
        : typesReassigned
          ? `Settings saved. Every bill type now belongs to the new payer; bills already posted keep their owner.`
          : "Settings saved.";
  } catch (e) {
    if (e instanceof ActionError) return { errors: e.message.split("\n"), values };
    throw e;
  }
  done(back, message);
}

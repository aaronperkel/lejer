"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/context";
import { withUser } from "@/lib/db";
import { fail } from "@/lib/flash";
import { createHousehold } from "@/lib/households";
import { householdPath } from "@/lib/paths";
import type { HouseholdMode, Theme } from "@/lib/types";

const PATH = "/new";
const MODES: HouseholdMode[] = ["single_payer", "ledger"];
const THEMES: Theme[] = ["statement", "peach"];

/** Onboarding: the user's real name, then their household (createHousehold, owner role). */
export async function createHouseholdAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const householdName = String(formData.get("householdName") ?? "").trim();
  const mode = String(formData.get("mode")) as HouseholdMode;
  const theme = String(formData.get("theme")) as Theme;
  const timezone = String(formData.get("timezone") ?? "");

  if (!name || name.length > 80) fail(PATH, "Enter your name (up to 80 characters).");
  if (!householdName || householdName.length > 80) fail(PATH, "Name your household (up to 80 characters).");
  if (!MODES.includes(mode)) fail(PATH, "Pick how your household pays its bills.");
  if (!THEMES.includes(theme)) fail(PATH, "Pick a look.");
  if (!Intl.supportedValuesOf("timeZone").includes(timezone) && timezone !== "UTC") {
    fail(PATH, "Pick a time zone from the list.");
  }

  await withUser(user.id, (tx) => tx`UPDATE users SET name = ${name} WHERE id = ${user.id}`);
  const household = await createHousehold({ userId: user.id, email: user.email, name: householdName, mode, theme, timezone });
  redirect(`${householdPath(household, "/household")}?${new URLSearchParams({ ok: `${householdName} is ready. Invite your roommates below.` })}`);
}

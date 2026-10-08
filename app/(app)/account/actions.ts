"use server";

import { redirect } from "next/navigation";
import { getCtxForHousehold, getSessionUser } from "@/lib/context";
import { withHousehold, withUser } from "@/lib/db";
import { done, fail } from "@/lib/flash";

const PATH = "/account";

/** Your display name, shared by every household you're in. */
export async function updateMyName(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) fail(PATH, "Enter your name (up to 80 characters).");
  await withUser(user.id, (tx) => tx`UPDATE users SET name = ${name} WHERE id = ${user.id}`);
  done(PATH, "Name updated.");
}

/**
 * Rotates your calendar token in one of your households: the old /cal.ics?k= link stops
 * working at once. Other members' links are untouched.
 */
export async function resetCalendarLink(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await getCtxForHousehold(Number(formData.get("householdId")));
  if (!ctx) fail(PATH, "You're not in that household any more.");
  await withHousehold(ctx, (tx) => tx`
    UPDATE memberships SET calendar_token = DEFAULT WHERE id = ${ctx.membership.id}`);
  done(PATH, `Your calendar link for ${ctx.household.name} was reset. Re-subscribe with the new one.`);
}

"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/context";
import { withHousehold, withUser } from "@/lib/db";
import { findMembership, markJoined } from "@/lib/households";
import { startSession } from "@/lib/session";

/** Re-issues the session cookie for another household the user belongs to. */
export async function switchHousehold(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const householdId = Number(formData.get("householdId"));

  const found = await withUser(user.id, (tx) => findMembership(tx, user.id, householdId));
  if (!found || found.household.id !== householdId) redirect("/households");
  // An invite that arrived while already signed in is accepted by opening it.
  if (!found.membership.joinedAt) {
    await withHousehold({ household: found.household, user }, (tx) => markJoined(tx, found.membership.id));
  }
  await startSession(user.id, householdId);
  redirect("/");
}

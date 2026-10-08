"use server";

import { redirect } from "next/navigation";
import { requireUserAction } from "@/lib/auth";
import { withHousehold } from "@/lib/db";
import { hasFeature } from "@/lib/features";
import { householdPath } from "@/lib/paths";

/** Marks the tour seen (first time only) and opens the dashboard. Does nothing with the tour off. */
export async function finishWelcome(): Promise<void> {
  const ctx = await requireUserAction();
  if (!ctx.demo && hasFeature(ctx.household, "welcomeTour") && !ctx.membership.welcomedAt) {
    await withHousehold(ctx, (tx) => tx`
      UPDATE memberships SET welcomed_at = now() WHERE id = ${ctx.membership.id} AND welcomed_at IS NULL`);
  }
  redirect(householdPath(ctx.household));
}

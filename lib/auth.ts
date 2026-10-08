import { notFound, redirect } from "next/navigation";
import { getCtx, getSessionUser, type Ctx } from "@/lib/context";
import type { Tx } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { householdPath } from "@/lib/paths";

// Page-level authorization redirects; action-level authorization throws. Every server action
// calls one of the *Action helpers itself: proxy.ts is only the first lock.

/**
 * The household the URL names, for a member of it. Signed in but not a member (or no such
 * household): not found, so a slug never confirms that a household exists. Signed out: login.
 */
export async function requireUser(): Promise<Ctx> {
  const ctx = await getCtx();
  if (ctx) return ctx;
  if (await getSessionUser()) notFound();
  redirect("/login");
}

export async function requireAdmin(): Promise<Ctx> {
  const ctx = await requireUser();
  if (ctx.membership.role !== "admin") redirect(householdPath(ctx.household, "/no-access"));
  return ctx;
}

/** Server actions: any member of the current household (the demo visitor included). */
export async function requireUserAction(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) throw new Error("Sign in required.");
  return ctx;
}

/** Server actions: admins of the current household (the demo viewer is one; actions refuse). */
export async function requireAdminAction(): Promise<Ctx> {
  const ctx = await requireUserAction();
  if (ctx.membership.role !== "admin") throw new Error("Admin access required.");
  return ctx;
}

/** Server actions on one bill type's bills: an admin, or the member who owns that type. */
export async function requireBillManager(tx: Tx, typeId: number): Promise<Ctx> {
  const ctx = await requireUserAction();
  await assertBillManager(tx, ctx, typeId);
  return ctx;
}

// The same rules with an explicit ctx, for library functions (and scripts/verify, which has no
// request). They throw ActionError so actions can show the message.

export function assertAdmin(ctx: Ctx): void {
  if (ctx.demo) throw new ActionError(DEMO_REFUSAL);
  if (ctx.membership.role !== "admin") throw new ActionError("Only a household admin can do that.");
}

/**
 * Managing something owned by `ownerId` (an existing bill's owner, or a type's owner for a new
 * bill): an admin, or that owner. Existing bills are judged by the bill's own owner_id, so
 * handing a type to someone else doesn't take the old owner's bills away from them.
 */
export function assertCanManage(ctx: Ctx, ownerId: number | null): void {
  if (ctx.demo) throw new ActionError(DEMO_REFUSAL);
  if (ctx.membership.role === "admin") return;
  if (ownerId === null || ownerId !== ctx.membership.id) {
    throw new ActionError("You can only post bills and mark payments for bill types you own.");
  }
}

/** Posting a new bill of a type: an admin, or the member who owns the type now. */
export async function assertBillManager(tx: Tx, ctx: Ctx, typeId: number): Promise<void> {
  if (ctx.demo) throw new ActionError(DEMO_REFUSAL);
  const [type] = await tx<{ ownerId: number | null }[]>`
    SELECT owner_id AS "ownerId" FROM bill_types WHERE id = ${typeId}`;
  assertCanManage(ctx, type ? type.ownerId : null);
}

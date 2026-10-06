import { redirect } from "next/navigation";
import { getCtx, getSessionUser, type Ctx } from "@/lib/context";
import type { Tx } from "@/lib/db";

// Page-level authorization redirects; action-level authorization throws. Every server action
// calls one of the *Action helpers itself: proxy.ts is only the first lock.

/** A household context, or off to onboarding (signed in, no household) / login. */
export async function requireUser(): Promise<Ctx> {
  const ctx = await getCtx();
  if (ctx) return ctx;
  redirect((await getSessionUser()) ? "/welcome/household" : "/login");
}

export async function requireAdmin(): Promise<Ctx> {
  const ctx = await requireUser();
  if (ctx.membership.role !== "admin") redirect("/no-access");
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
  if (ctx.membership.role === "admin") return ctx;
  const [type] = await tx<{ ownerId: number | null }[]>`
    SELECT owner_id AS "ownerId" FROM bill_types WHERE id = ${typeId}`;
  if (!type || type.ownerId !== ctx.membership.id) throw new Error("Not your bill type.");
  return ctx;
}

import { cache } from "react";
import { connection } from "next/server";
import { withUser } from "@/lib/db";
import { demoCtx } from "@/lib/demo";
import { findMembership, findMembershipBySlug, getUserByEmail, getUserById } from "@/lib/households";
import { devBypass, getSession, hasDemoCookie } from "@/lib/session";
import type { Household, Membership, User } from "@/lib/types";

export interface Ctx {
  user: User;
  membership: Membership;
  household: Household;
  demo: boolean;
}

/**
 * The request as { user, membership, household }, once per request, or null.
 * Order: dev bypass → session cookie → demo cookie (only with no session).
 * The cookie's hid is checked against memberships every time; a stale or revoked hid falls
 * back to the user's first membership. A signed-in user with no membership gets null (see
 * getSessionUser for pages that only need the user).
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  await connection(); // per-request, never prerendered
  const dev = devBypass();
  if (dev) {
    const user = await getSessionUser();
    if (!user) return null;
    const found = await withUser(user.id, (tx) => findMembershipBySlug(tx, user.id, dev.slug));
    return found ? { user, ...found, demo: false } : null;
  }

  const session = await getSession();
  if (session) {
    const user = await getSessionUser();
    if (!user) return null;
    const found = await withUser(user.id, (tx) => findMembership(tx, user.id, session.hid));
    return found ? { user, ...found, demo: false } : null;
  }

  return (await hasDemoCookie()) ? demoCtx() : null;
});

/** The signed-in user (dev bypass or session), household or not. Never the demo visitor. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  await connection();
  const dev = devBypass();
  if (dev) return withUser(null, (tx) => getUserByEmail(tx, dev.email));
  const session = await getSession();
  if (!session) return null;
  return withUser(session.uid, (tx) => getUserById(tx, session.uid));
});

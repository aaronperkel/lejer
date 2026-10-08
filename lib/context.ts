import { cache } from "react";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { withHousehold, withUser } from "@/lib/db";
import { demoCtx } from "@/lib/demo";
import { findMembership, findMembershipBySlug, getUserByEmail, getUserById, listMyHouseholds, markJoined } from "@/lib/households";
import { DEMO_SLUG, HOUSEHOLD_HEADER, householdPath } from "@/lib/paths";
import { HOUSEHOLD_COOKIE, devBypass, getSession } from "@/lib/session";
import type { Household, Membership, User } from "@/lib/types";

export interface Ctx {
  user: User;
  membership: Membership;
  household: Household;
  demo: boolean;
}

/**
 * The request as { user, membership, household }, once per request, or null.
 * The household is the one the URL names (proxy.ts passes its slug in HOUSEHOLD_HEADER;
 * lib/paths.ts), checked against the viewer's memberships every time: no membership, no ctx.
 * /demo is the in-memory demo household for anyone. Pages outside a household (/account,
 * /households, /new, /login) get null; getSessionUser serves them.
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  await connection(); // per-request, never prerendered
  const slug = (await headers()).get(HOUSEHOLD_HEADER);
  if (!slug) return null;
  if (slug === DEMO_SLUG) return demoCtx();
  const user = await getSessionUser();
  if (!user) return null;
  return accept(user, await withUser(user.id, (tx) => findMembershipBySlug(tx, user.id, slug)));
});

/**
 * The same, for a household named by id rather than by the URL: /files and the document
 * upload handshake, whose keys carry h/{id}/.
 */
export async function getCtxForHousehold(householdId: number): Promise<Ctx | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const found = await withUser(user.id, (tx) => findMembership(tx, user.id, householdId));
  return accept(user, found?.household.id === householdId ? found : null);
}

/** Opening a household you were invited to accepts the invite (signing in does too). */
async function accept(user: User, found: { membership: Membership; household: Household } | null): Promise<Ctx | null> {
  if (!found) return null;
  let { membership } = found;
  if (!membership.joinedAt) {
    await withHousehold({ household: found.household, user }, (tx) => markJoined(tx, membership.id));
    membership = { ...membership, joinedAt: new Date() };
  }
  return { user, membership, household: found.household, demo: false };
}

/** The signed-in user (dev bypass or session), household or not. Never the demo visitor. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  await connection();
  const dev = devBypass();
  if (dev) return withUser(null, (tx) => getUserByEmail(tx, dev.email));
  const session = await getSession();
  if (!session) return null;
  return withUser(session.uid, (tx) => getUserById(tx, session.uid));
});

/**
 * Where "Sign in" takes someone already signed in: the household they opened last (the dev
 * bypass's, under it), else their first, joined before pending; with none, onboarding.
 */
export async function homePath(user: User): Promise<string> {
  const mine = await withUser(user.id, (tx) => listMyHouseholds(tx, user.id));
  if (mine.length === 0) return "/new";
  const last = devBypass()?.slug ?? (await cookies()).get(HOUSEHOLD_COOKIE)?.value;
  const first = [...mine].sort((a, b) => Number(!a.joinedAt) - Number(!b.joinedAt) || a.id - b.id)[0];
  return householdPath(mine.find((h) => h.slug === last) ?? first);
}

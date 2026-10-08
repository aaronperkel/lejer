import { notFound } from "next/navigation";
import type { Ctx } from "@/lib/context";
import { ActionError } from "@/lib/errors";
import { householdPath } from "@/lib/paths";
import type { Household } from "@/lib/types";

// The household's optional features, in one place: the nav, the footer, the household tabs, the
// routes and the actions all ask here, so turning a feature off hides it everywhere and its
// route answers not-found. ARCHITECTURE.md §7.

export const FEATURES = {
  rent: { key: "featureRent", label: "Rent", hint: "Adds a monthly rent reminder to everyone's calendar feed." },
  trends: { key: "featureTrends", label: "Trends", hint: "A chart of spending per bill type, with a CSV export." },
  bulkEmail: { key: "featureBulkEmail", label: "Bulk email", hint: "Lets admins write one note to the whole household." },
  documents: { key: "featureDocuments", label: "Documents", hint: "A shared shelf for the lease and other paperwork." },
  welcomeTour: { key: "featureWelcomeTour", label: "Welcome tour", hint: "Walks each member through how the household works the first time they sign in." },
  thanks: { key: "featureThanks", label: "Thank-you receipts", hint: "Emails a short receipt when someone is checked off as paid." },
} as const satisfies Record<string, { key: keyof Household; label: string; hint: string }>;

export type Feature = keyof typeof FEATURES;

export const hasFeature = (h: Household, f: Feature): boolean => h[FEATURES[f].key] === true;

/** Pages and route handlers: a disabled feature's page does not exist. */
export function requireFeature(ctx: Ctx, f: Feature): void {
  if (!hasFeature(ctx.household, f)) notFound();
}

/** Server actions: refuse with a reason the person can read. */
export function assertFeature(ctx: Ctx, f: Feature): void {
  if (!hasFeature(ctx.household, f)) throw new ActionError(`${FEATURES[f].label} is turned off for ${ctx.household.name}.`);
}

/**
 * The header's household links, in order: what this person can open in this household. The
 * person's own pages (account, households, sign out) are the name menu's, not these.
 */
export function navLinks(ctx: Ctx): { href: string; label: string }[] {
  const h = ctx.household;
  return [
    { href: householdPath(h), label: "Overview" },
    { href: householdPath(h, "/bills"), label: "Bills" },
    ...(hasFeature(h, "trends") ? [{ href: householdPath(h, "/trends"), label: "Trends" }] : []),
    ...(hasFeature(h, "documents") ? [{ href: householdPath(h, "/documents"), label: "Docs" }] : []),
    { href: householdPath(h, "/household"), label: "Household" },
  ];
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SubmitButton from "@/app/components/SubmitButton";
import { getCtx, getSessionUser } from "@/lib/context";
import { withUser } from "@/lib/db";
import { listMyHouseholds } from "@/lib/households";
import { devBypass } from "@/lib/session";
import { switchHousehold } from "./actions";

export const metadata: Metadata = { title: "Your households — Lejer" };

export default async function HouseholdsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [ctx, households] = await Promise.all([getCtx(), withUser(user.id, (tx) => listMyHouseholds(tx, user.id))]);

  return (
    <main className="mx-auto max-w-xl space-y-6 py-6">
      <header>
        <span className="eyebrow mb-1">{user.email}</span>
        <h1 className="page-title">Your households</h1>
      </header>
      {devBypass() && (
        <p className="flash flash-err">APP_DEV_HOUSEHOLD pins this session to one household; switching has no effect.</p>
      )}

      {households.length === 0 ? (
        <p className="text-sm text-ink-muted">You aren&apos;t in a household yet.</p>
      ) : (
        <ul className="panel divide-y divide-line-soft">
          {households.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <span className="font-medium">{h.name}</span>
                <span className="block text-xs text-ink-muted">
                  {h.role}
                  {h.joinedAt ? "" : " · new invite"}
                </span>
              </div>
              {h.id === ctx?.household.id ? (
                <span className="tag bg-accent-soft text-accent">Current</span>
              ) : (
                <form action={switchHousehold}>
                  <input type="hidden" name="householdId" value={h.id} />
                  <SubmitButton className="btn btn-sm" pendingLabel="Opening…">Open</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <Link href="/welcome/household" className="btn">Start a new household</Link>
    </main>
  );
}

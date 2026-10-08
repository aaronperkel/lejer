import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/context";
import { withUser } from "@/lib/db";
import { listMyHouseholds } from "@/lib/households";
import { householdPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Your households" };

// Every household you're in, each at its own URL. Opening a pending invite accepts it (getCtx).
export default async function HouseholdsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const households = await withUser(user.id, (tx) => listMyHouseholds(tx, user.id));

  return (
    <main className="mx-auto max-w-xl space-y-6 py-6">
      <header>
        <span className="eyebrow mb-1">{user.email}</span>
        <h1 className="page-title">Your households</h1>
      </header>

      {households.length === 0 ? (
        <p className="text-sm text-ink-muted">You aren&apos;t in a household yet.</p>
      ) : (
        <ul className="panel divide-y divide-line-soft">
          {households.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <span className="font-medium">{h.name}</span>
                <span className="block truncate text-xs text-ink-muted">
                  <span className="figure">{householdPath(h)}</span> · {h.role}
                  {h.joinedAt ? "" : " · new invite"}
                </span>
              </div>
              <Link className="btn btn-sm" href={householdPath(h)}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href="/new" className="btn">Start a new household</Link>
    </main>
  );
}

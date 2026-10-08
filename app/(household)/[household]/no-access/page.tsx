import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { householdPath } from "@/lib/paths";

export default async function NoAccessPage() {
  const ctx = await requireUser();
  return (
    <main className="mx-auto max-w-xl px-5 py-24 text-center">
      <span className="eyebrow mb-2">403</span>
      <h1 className="mb-3 text-2xl font-bold">Not authorized</h1>
      <p className="text-ink-muted">
        Your account can&apos;t open this page in this household. If you think that&apos;s a mistake, ask one of
        the household&apos;s admins.
      </p>
      <p className="mt-6">
        <Link className="btn" href={householdPath(ctx.household)}>Back to the dashboard</Link>
      </p>
    </main>
  );
}

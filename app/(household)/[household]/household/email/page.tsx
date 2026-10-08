import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Flash from "@/app/components/Flash";
import HouseholdTabs from "@/app/(household)/[household]/household/HouseholdTabs";
import { requireAdmin } from "@/lib/auth";
import { nameList } from "@/emails/Shell";
import { nextUtcMidnight } from "@/lib/time";
import { loadBulkEmail } from "@/lib/views";
import BulkEmailForm from "./BulkEmailForm";

export const metadata: Metadata = { title: "Email the household" };

// Bulk email (feature_bulk_email): an admin's note to everyone who has signed in.
export default async function BulkEmailPage({ searchParams }: PageProps<"/[household]/household/email">) {
  const ctx = await requireAdmin();
  if (!ctx.household.featureBulkEmail) notFound();
  const { ok, err } = await searchParams;
  const { joined, pending, fits } = await loadBulkEmail(ctx);
  const retryAfter = `${nextUtcMidnight(ctx.household.timezone).local} (${ctx.household.timezone.replaceAll("_", " ")} time)`;

  return (
    <main>
      <HouseholdTabs active="email" ctx={ctx} />
      <Flash ok={ok} err={err} />
      <div className="mb-2 flex items-center gap-3">
        <h2 className="eyebrow">Email the household</h2>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
      </div>
      <p className="mb-4 max-w-[65ch] text-sm text-ink-muted">
        {joined.length === 0
          ? "Nobody has signed in yet, so there's no one to email."
          : `Goes to ${nameList(joined.map((j) => j.name))}.`}
        {pending.length > 0 && ` Not to ${nameList(pending)}, who ${pending.length === 1 ? "hasn't" : "haven't"} signed in yet.`}
      </p>
      <BulkEmailForm count={joined.length} fits={fits} retryAfter={retryAfter} />
    </main>
  );
}

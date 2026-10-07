import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CalendarLinks from "@/app/components/CalendarLinks";
import CopyField from "@/app/components/CopyField";
import Flash from "@/app/components/Flash";
import SubmitButton from "@/app/components/SubmitButton";
import { getCtx, getSessionUser } from "@/lib/context";
import { calendarLinks } from "@/lib/ics";
import { loadCalendarToken } from "@/lib/views";
import { resetCalendarLink, updateMyName } from "./actions";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await getCtx();
  const { ok, err } = await searchParams;
  const token = ctx ? await loadCalendarToken(ctx) : null;

  return (
    <main className="mx-auto max-w-xl space-y-6 py-6">
      <header>
        <span className="eyebrow mb-1">{user.email}</span>
        <h1 className="page-title">Account</h1>
      </header>
      <Flash ok={ok} err={err} />

      <section className="panel p-5">
        <form action={updateMyName}>
          <label className="field-label" htmlFor="name">Your name</label>
          <p className="mb-2 text-xs text-ink-muted">Shown to everyone in every household you&apos;re in.</p>
          <div className="flex gap-2">
            <input className="field-input" id="name" name="name" defaultValue={user.name} maxLength={80} required />
            <SubmitButton className="btn btn-primary" pendingLabel="Saving…">Save</SubmitButton>
          </div>
        </form>
      </section>

      {ctx && token && (
        <section className="panel space-y-4 p-5" aria-labelledby="calendar-heading">
          <div>
            <h2 id="calendar-heading" className="eyebrow mb-1">
              Calendar · {ctx.household.name}
            </h2>
            <p className="text-sm text-ink-muted">
              Every bill&apos;s due date in your own calendar, saying what you owe and to whom. It updates on its own.
            </p>
          </div>
          <CalendarLinks token={token} />
          <CopyField id="calendar-url" label="Or paste this link into any calendar app" value={calendarLinks(token).https} />
          <div className="border-t border-line-soft pt-4">
            <p className="mb-3 text-sm text-ink-muted">
              The link is yours alone. If it ends up somewhere it shouldn&apos;t, reset it: the old link stops working right
              away, and nobody else&apos;s changes.
            </p>
            <form action={resetCalendarLink}>
              <SubmitButton className="btn" pendingLabel="Resetting…">Reset my calendar link</SubmitButton>
            </form>
          </div>
        </section>
      )}
    </main>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CalendarLinks from "@/app/components/CalendarLinks";
import CopyField from "@/app/components/CopyField";
import Flash from "@/app/components/Flash";
import SubmitButton from "@/app/components/SubmitButton";
import { getSessionUser } from "@/lib/context";
import { withUser } from "@/lib/db";
import { listMyCalendarTokens, listMyHouseholds } from "@/lib/households";
import { calendarLinks } from "@/lib/ics";
import { resetCalendarLink, updateMyName } from "./actions";

export const metadata: Metadata = { title: "Account" };

// You, across households: your name, and your calendar link in each household you've joined.
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { ok, err } = await searchParams;
  const [households, tokens] = await withUser(user.id, async (tx) =>
    Promise.all([listMyHouseholds(tx, user.id), listMyCalendarTokens(tx, user.id)]),
  );
  const calendars = households.flatMap((h) => {
    const token = tokens.get(h.id);
    return token ? [{ ...h, token }] : [];
  });

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

      {calendars.map((h) => (
        <section key={h.id} className="panel space-y-4 p-5" aria-labelledby={`calendar-heading-${h.id}`}>
          <div>
            <h2 id={`calendar-heading-${h.id}`} className="eyebrow mb-1">
              Calendar · {h.name}
            </h2>
            <p className="text-sm text-ink-muted">
              Every bill&apos;s due date in your own calendar, saying what you owe and to whom. It updates on its own.
            </p>
          </div>
          <CalendarLinks token={h.token} />
          <CopyField id={`calendar-url-${h.id}`} label="Or paste this link into any calendar app" value={calendarLinks(h.token).https} />
          <div className="border-t border-line-soft pt-4">
            <p className="mb-3 text-sm text-ink-muted">
              The link is yours alone. If it ends up somewhere it shouldn&apos;t, reset it: the old link stops working right
              away, and nobody else&apos;s changes.
            </p>
            <form action={resetCalendarLink}>
              <input type="hidden" name="householdId" value={h.id} />
              <SubmitButton className="btn" pendingLabel="Resetting…">Reset my calendar link</SubmitButton>
            </form>
          </div>
        </section>
      ))}
    </main>
  );
}

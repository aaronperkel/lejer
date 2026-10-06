import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Flash from "@/app/components/Flash";
import SubmitButton from "@/app/components/SubmitButton";
import { getSessionUser } from "@/lib/context";
import { createHouseholdAction } from "./actions";
import TimezoneSelect from "./TimezoneSelect";

export const metadata: Metadata = { title: "Set up your household — Lejer" };

const MODES = [
  {
    value: "single_payer",
    title: "One person pays",
    blurb: "One roommate pays every bill and everyone else pays them back.",
  },
  {
    value: "ledger",
    title: "Each bill has an owner",
    blurb: "Different people front different bills; Lejer tracks who owes whom.",
  },
] as const;

const THEMES = [
  { value: "statement", title: "Statement", blurb: "Paper ledger, one accent blue, dark mode." },
  { value: "peach", title: "Peach", blurb: "Cream paper and a peach awning. Light only." },
] as const;

export default async function WelcomeHouseholdPage({ searchParams }: PageProps<"/welcome/household">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { ok, err } = await searchParams;

  const card =
    "panel flex cursor-pointer gap-3 p-4 has-[:checked]:border-accent has-[:checked]:ring-2 has-[:checked]:ring-accent/25";

  return (
    <main className="mx-auto max-w-xl py-6">
      <span className="eyebrow mb-1">Welcome to Lejer</span>
      <h1 className="page-title mb-5">Set up your household</h1>
      <Flash ok={ok} err={err} />
      <form action={createHouseholdAction} className="space-y-6">
        <div>
          <label className="field-label" htmlFor="name">Your name</label>
          <input className="field-input" id="name" name="name" defaultValue={user.name} maxLength={80} required autoFocus />
          <p className="mt-1 text-xs text-ink-muted">Your roommates see this. Signed in as {user.email}.</p>
        </div>

        <div>
          <label className="field-label" htmlFor="householdName">Household name</label>
          <input className="field-input" id="householdName" name="householdName" placeholder="12 Elm Street" maxLength={80} required />
        </div>

        <fieldset>
          <legend className="field-label">How are bills paid?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {MODES.map((m, i) => (
              <label key={m.value} className={card}>
                <input type="radio" name="mode" value={m.value} defaultChecked={i === 0} className="mt-1" required />
                <span>
                  <span className="block text-sm font-semibold">{m.title}</span>
                  <span className="block text-sm text-ink-muted">{m.blurb}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">You can switch later in settings; nothing is lost either way.</p>
        </fieldset>

        <fieldset>
          <legend className="field-label">Look</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {THEMES.map((t, i) => (
              <label key={t.value} className={card}>
                <input type="radio" name="theme" value={t.value} defaultChecked={i === 0} className="mt-1" required />
                <span>
                  <span className="block text-sm font-semibold">{t.title}</span>
                  <span className="block text-sm text-ink-muted">{t.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="field-label" htmlFor="timezone">Time zone</label>
          <TimezoneSelect zones={Intl.supportedValuesOf("timeZone")} fallback="America/New_York" />
          <p className="mt-1 text-xs text-ink-muted">Reminder emails go out in the morning, in this time zone.</p>
        </div>

        <SubmitButton className="btn btn-primary w-full" pendingLabel="Creating…">
          Create household
        </SubmitButton>
      </form>
    </main>
  );
}

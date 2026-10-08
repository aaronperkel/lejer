"use client";

import { useEffect, useState } from "react";
import SubmitButton from "@/app/components/SubmitButton";
import { BRAND } from "@/lib/brand";
import type { HouseholdMode } from "@/lib/types";
import { finishWelcome } from "./actions";

/*
 * The welcome tour, ported from peach-cob: five short scenes that walk a member through the
 * life of a bill, told for the household's mode. Scenes are built from the app's own pieces
 * (panels, tags, due chips, ledger figures) and stagger in with the .tour-* classes. It plays
 * on its own like a little film until the viewer touches a control, and never auto-advances
 * under prefers-reduced-motion (the global rule in globals.css also settles every entrance).
 * The names in scenes two to four are examples; the first scene shows the household's real
 * bill types when it has any.
 */

const AUTO_ADVANCE_MS = 6500;
const EXAMPLE = { payer: "Jordan", others: ["Robin", "Casey", "Morgan"], share: "$26.03", total: "$104.12" };

type Owner = { emoji: string; type: string; owner: string | null };

function SceneOwners({ owners, mode }: { owners: Owner[]; mode: HouseholdMode }) {
  const shown = owners.length
    ? owners
    : mode === "single_payer"
      ? [
          { emoji: "⚡", type: "Electric", owner: EXAMPLE.payer },
          { emoji: "🔥", type: "Gas", owner: EXAMPLE.payer },
          { emoji: "💧", type: "Water", owner: EXAMPLE.payer },
          { emoji: "🛜", type: "Wifi", owner: EXAMPLE.payer },
        ]
      : [
          { emoji: "🛜", type: "Wifi", owner: "Robin" },
          { emoji: "⚡", type: "Electric", owner: EXAMPLE.payer },
          { emoji: "🔥", type: "Gas", owner: "Casey" },
          { emoji: "💧", type: "Water", owner: "Morgan" },
        ];
  return (
    <div className="flex w-full flex-wrap justify-center gap-2.5">
      {shown.map((o, i) => (
        <div key={o.type} className="tour-pop panel flex w-[calc(50%-0.35rem)] flex-col items-center gap-1 px-2 py-3 text-center sm:w-[7.5rem]" style={{ animationDelay: `${i * 0.15}s` }}>
          <span className="text-2xl" aria-hidden="true">
            {o.emoji}
          </span>
          <span className="eyebrow">{o.type}</span>
          <span className="text-sm font-semibold">{o.owner ?? "The house"}</span>
        </div>
      ))}
    </div>
  );
}

function ScenePost() {
  const everyone = [EXAMPLE.payer, ...EXAMPLE.others];
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="tour-slide panel flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-3">
        <span className="text-xl" aria-hidden="true">
          ⚡
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Electric</div>
          <div className="eyebrow">posted by {EXAMPLE.payer}</div>
        </div>
        <span className="figure text-lg font-semibold">{EXAMPLE.total}</span>
        <span className="due-chip due-soon">due in 5 days</span>
      </div>
      <div className="tour-pop figure text-sm text-ink-muted" style={{ animationDelay: "0.6s" }} aria-hidden="true">
        ÷ {everyone.length}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {everyone.map((n, i) => (
          <span key={n} className="tour-pop tag tag-info" style={{ animationDelay: `${0.9 + i * 0.15}s` }}>
            {n} · {EXAMPLE.share}
          </span>
        ))}
      </div>
    </div>
  );
}

function SceneLedger() {
  return (
    <div className="w-full max-w-xs">
      <span className="eyebrow mb-2 text-center">The house ledger</span>
      <div className="panel divide-y divide-line-soft">
        {EXAMPLE.others.map((name, i) => (
          <div key={name} className="tour-slide flex items-center justify-between gap-3 px-4 py-2.5 text-sm" style={{ animationDelay: `${i * 0.3}s` }}>
            <span>
              <strong>{name}</strong> <span className="text-ink-muted">owes {EXAMPLE.payer}</span>
            </span>
            <span className="figure font-semibold">{EXAMPLE.share}</span>
          </div>
        ))}
      </div>
      <p className="tour-pop mt-3 text-center text-xs text-ink-muted" style={{ animationDelay: "1.1s" }}>
        {EXAMPLE.payer} fronted the whole bill, so their own share is already covered.
      </p>
    </div>
  );
}

function ScenePaid() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="panel w-full max-w-xs divide-y divide-line-soft">
        {EXAMPLE.others.map((name, i) => (
          <div key={name} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span>
              {name} paid {EXAMPLE.payer} back
            </span>
            <span
              className="tour-check inline-flex size-5 items-center justify-center rounded-(--radius-sm) bg-paid-soft text-paid"
              style={{ animationDelay: `${0.3 + i * 0.55}s` }}
              aria-hidden="true"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
          </div>
        ))}
      </div>
      <span className="tour-stamp tag tag-paid px-3 py-1 text-sm" style={{ animationDelay: "2s" }}>
        Paid
      </span>
    </div>
  );
}

function SceneReminders({ reminders }: { reminders: { first: number; urgent: number } | null }) {
  const notes = [
    ...(reminders
      ? [
          { icon: "📬", title: `A heads-up ${reminders.first} ${reminders.first === 1 ? "day" : "days"} before a bill is due`, sub: "one friendly email, only if you still owe" },
          {
            icon: "⏰",
            title: reminders.urgent > 0 ? `Then daily from ${reminders.urgent} ${reminders.urgent === 1 ? "day" : "days"} out` : "Then one on the due date",
            sub: "and every few days if it runs late",
          },
        ]
      : [{ icon: "📬", title: "A reminder when someone sends one", sub: "this household doesn't send them on a schedule" }]),
    { icon: "📅", title: "Every due date on your calendar", sub: "subscribe once from the dashboard" },
  ];
  return (
    <div className="flex w-full max-w-sm flex-col gap-2.5">
      {notes.map((n, i) => (
        <div key={n.title} className="tour-slide panel flex items-center gap-3 px-4 py-3 text-sm" style={{ animationDelay: `${i * 0.45}s` }}>
          <span aria-hidden="true">{n.icon}</span>
          <div className="leading-snug">
            <div className="font-semibold">{n.title}</div>
            <div className="text-xs text-ink-muted">{n.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function steps(mode: HouseholdMode, household: string, owners: Owner[], reminders: { first: number; urgent: number } | null) {
  const single = mode === "single_payer";
  return [
    single
      ? {
          title: "One person pays every bill",
          body: `Every account is in one person's name, and they pay the providers each month. ${household} keeps track of what everyone else owes them.`,
          scene: <SceneOwners owners={owners} mode={mode} />,
        }
      : {
          title: "Every bill has an owner",
          body: `Each account is in someone's name, and they pay that provider every month. ${household} knows who fronts what.`,
          scene: <SceneOwners owners={owners} mode={mode} />,
        },
    {
      title: "The bill gets posted",
      body: single
        ? "When a statement arrives, the payer posts it with the amount and due date, and the total splits evenly across everyone who shares bills."
        : "When a statement arrives, its owner posts it with the amount and due date, and the total splits evenly across everyone who shares bills.",
      scene: <ScenePost />,
    },
    {
      title: single ? "You pay back your share" : "Everyone else pays them back",
      body: single
        ? "The payer already covered the whole bill, so the dashboard just says what you owe and by when."
        : "The owner already covered the whole bill, so the others owe them their shares. The dashboard always shows who owes whom.",
      scene: <SceneLedger />,
    },
    {
      title: "Check it off",
      body: `Pay them back however you like: Venmo, cash, a transfer. ${BRAND.name} never moves money. Once they've got it, they check you off, and when the last share is in, the bill reads paid.`,
      scene: <ScenePaid />,
    },
    {
      title: "You won't have to remember",
      body: reminders
        ? "Reminders only go to people who still owe, and the calendar feed keeps every due date where you'll see it."
        : "Anyone fronting a bill can send a reminder from the Bills page, and the calendar feed keeps every due date where you'll see it.",
      scene: <SceneReminders reminders={reminders} />,
    },
  ];
}

export default function Tour({
  name,
  household,
  mode,
  owners,
  reminders,
  firstVisit,
}: {
  name: string;
  household: string;
  mode: HouseholdMode;
  owners: Owner[];
  reminders: { first: number; urgent: number } | null;
  firstVisit: boolean;
}) {
  const STEPS = steps(mode, household, owners, reminders);
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const last = STEPS.length - 1;

  useEffect(() => {
    if (!auto || step >= last) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setStep((s) => Math.min(s + 1, last)), AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [auto, step, last]);

  const goTo = (s: number) => {
    setAuto(false);
    setStep(Math.max(0, Math.min(last, s)));
  };

  return (
    <main className="mx-auto max-w-xl py-2 sm:py-8">
      <div className="mb-6 text-center">
        <h1 className="display text-3xl font-semibold tracking-tight">Hi, {name}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {firstVisit ? `Here's how ${household} works. It takes about thirty seconds.` : `How ${household} works, in five steps.`}
        </p>
      </div>

      <div className="panel panel-awning overflow-hidden">
        {/* key={step} remounts the scene so its entrance plays again */}
        <div key={step} className="flex min-h-[230px] items-center justify-center px-5 py-6 sm:px-8" aria-hidden="true">
          {STEPS[step].scene}
        </div>
        <div className="border-t border-line-soft px-5 py-5 sm:px-8" aria-live="polite">
          <span className="eyebrow figure">
            Step {step + 1} of {STEPS.length}
          </span>
          <h2 className="display mt-1 text-xl font-semibold">{STEPS[step].title}</h2>
          <p className="mt-1.5 text-sm text-ink-muted">{STEPS[step].body}</p>
          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex items-center">
              {STEPS.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  aria-current={i === step ? "step" : undefined}
                  onClick={() => goTo(i)}
                  className="group flex size-7 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className={`size-2.5 rounded-full transition-colors duration-100 ${i === step ? "bg-accent" : "bg-line group-hover:bg-ink-muted"}`} />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button type="button" className="btn" onClick={() => goTo(step - 1)}>
                  Back
                </button>
              )}
              {step < last ? (
                <button type="button" className="btn btn-primary" onClick={() => goTo(step + 1)}>
                  Next
                </button>
              ) : (
                <form action={finishWelcome}>
                  <SubmitButton className="btn btn-primary" pendingLabel="Opening…">
                    Go to the dashboard
                  </SubmitButton>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {step < last && (
        <form action={finishWelcome} className="mt-4 text-center">
          <button type="submit" className="cursor-pointer text-sm text-ink-muted underline underline-offset-2 hover:text-ink">
            Skip the tour
          </button>
        </form>
      )}
    </main>
  );
}

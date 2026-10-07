import type { Metadata } from "next";
import Flash from "@/app/components/Flash";
import PortalTabs from "@/app/portal/PortalTabs";
import { requireUser } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { OVERDUE_EVERY_DAYS } from "@/lib/reminders";
import { localDate, localHour } from "@/lib/time";
import type { Household, ReminderRun } from "@/lib/types";
import { FEATURES, type Feature, hasFeature } from "@/lib/features";
import { settingsFormFrom } from "@/lib/settings";
import { loadSettings } from "@/lib/views";
import SettingsForm from "./SettingsForm";
import { hourLabel, scheduleSentence } from "./schedule";

export const metadata: Metadata = { title: "Settings" };

// Every household setting (ARCHITECTURE.md §7). Everyone can read them; only admins get the form.
export default async function SettingsPage({ searchParams }: PageProps<"/portal/settings">) {
  const ctx = await requireUser();
  const { ok, err } = await searchParams;
  const { run, members, payerId } = await loadSettings(ctx);
  const h = ctx.household;
  const isAdmin = ctx.membership.role === "admin" && !ctx.demo;
  const readout = <Readout h={h} run={run} />;

  return (
    <main>
      <PortalTabs active="settings" ctx={ctx} />
      <Flash ok={ok} err={err} />
      {isAdmin ? (
        <SettingsForm
          initial={settingsFormFrom(h, payerId)}
          context={{
            zones: Intl.supportedValuesOf("timeZone"),
            householdName: h.name,
            slug: h.slug,
            savedMode: h.mode,
            savedPayerId: payerId === null ? "" : String(payerId),
            members,
            overdueEvery: OVERDUE_EVERY_DAYS,
            readout,
          }}
        />
      ) : (
        <ReadOnly h={h} readout={readout} demo={ctx.demo} payer={members.find((m) => m.id === payerId)?.name ?? null} />
      )}
    </main>
  );
}

function when(d: Date, timezone: string): string {
  return d.toLocaleString("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "What the cron last did, and when it will next send", in the household's own time. */
function nextBatch(h: Household, run: ReminderRun): string {
  if (!h.remindersEnabled) return "Off";
  if (!run.lastRunAt) return "After the first check-in";
  const today = localDate(h.timezone);
  if (run.lastSendDate && run.lastSendDate >= today) return `Tomorrow, ${hourLabel(h.sendHour)}`;
  if (localHour(h.timezone) >= h.sendHour) return "At the next check-in";
  return `Today, ${hourLabel(h.sendHour)}`;
}

function Readout({ h, run }: { h: Household; run: ReminderRun }) {
  // Times and counts read in the ledger face; the "not yet" kind of answer is plain words.
  const next = nextBatch(h, run);
  const items = [
    { label: "Last check-in", value: run.lastRunAt ? when(run.lastRunAt, h.timezone) : "Not yet", figure: !!run.lastRunAt },
    { label: "Last batch", value: run.lastSentAt ? `${when(run.lastSentAt, h.timezone)} · ${run.lastSentCount} sent` : "None yet", figure: !!run.lastSentAt },
    { label: "Next batch", value: next, figure: /\d/.test(next) },
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 border-t border-line-soft pt-4 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="eyebrow mb-0.5">{i.label}</dt>
          <dd className={`text-sm ${i.figure ? "figure" : ""}`}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReadOnly({ h, readout, demo, payer }: { h: Household; readout: React.ReactNode; demo: boolean; payer: string | null }) {
  const on = (Object.keys(FEATURES) as Feature[]).filter((k) => hasFeature(h, k));
  const groups: { title: string; rows: { label: string; value: string }[]; extra?: React.ReactNode; note?: string }[] = [
    {
      title: "Household",
      rows: [
        { label: "Name", value: h.name },
        ...(h.tagline ? [{ label: "Tagline", value: h.tagline }] : []),
        { label: "Bills are split", value: h.mode === "single_payer" ? `${payer ?? "One person"} pays every bill` : "Each bill type has its own owner" },
      ],
    },
    { title: "Look", rows: [{ label: "Theme", value: h.theme === "peach" ? "Peach" : h.colorScheme === "light" ? "Statement, always light" : "Statement, matches your device" }] },
    {
      title: "Features",
      rows: [
        { label: "Turned on", value: on.length ? on.map((k) => FEATURES[k].label).join(", ") : "None" },
        ...(h.featureRent && h.monthlyRent !== null ? [{ label: "Monthly rent", value: `$${h.monthlyRent.toFixed(2)}` }] : []),
        ...(h.featureRent && h.leaseStart && h.leaseEnd ? [{ label: "Lease", value: `${h.leaseStart} to ${h.leaseEnd}` }] : []),
      ],
    },
    {
      title: "Bills",
      rows: [
        { label: "Statement date", value: h.askBillDate ? "Asked when posting" : "The day it's posted" },
        { label: "Bills per page", value: String(h.billsPerPage) },
      ],
    },
    {
      title: "Reminders",
      rows: [{ label: "Reminder emails", value: h.remindersEnabled ? "On" : "Off" }],
      note: h.remindersEnabled
        ? scheduleSentence({ first: h.firstReminderDays, urgent: h.urgentReminderDays, hour: h.sendHour, overdueEvery: OVERDUE_EVERY_DAYS })
        : undefined,
      extra: readout,
    },
    { title: "Time", rows: [{ label: "Time zone", value: h.timezone.replaceAll("_", " ") }] },
    {
      title: "Email",
      rows: [
        { label: "Inboxes show", value: `${h.fromName || h.name} via ${BRAND.name}` },
        { label: "Replies go to", value: h.replyTo ?? "Nobody set" },
        { label: "Digest copies to", value: h.digestEmail ?? "Nobody" },
      ],
    },
  ];
  return (
    <div className="space-y-8">
      <p className="text-sm text-ink-muted">{demo ? "The demo's settings are read-only." : "Only a household admin can change these."}</p>
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`group-${g.title}`}>
          <div className="mb-2 flex items-center gap-3">
            <h2 id={`group-${g.title}`} className="eyebrow">
              {g.title}
            </h2>
            <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
          </div>
          <div className="panel space-y-4 p-5">
            <dl className="space-y-2">
              {g.rows.map((r) => (
                <div key={r.label} className="flex flex-wrap justify-between gap-x-6 gap-y-0.5">
                  <dt className="text-sm text-ink-muted">{r.label}</dt>
                  <dd className="text-sm font-medium [overflow-wrap:anywhere]">{r.value}</dd>
                </div>
              ))}
            </dl>
            {g.note && <p className="text-sm text-ink-muted">{g.note}</p>}
            {g.extra}
          </div>
        </section>
      ))}
    </div>
  );
}

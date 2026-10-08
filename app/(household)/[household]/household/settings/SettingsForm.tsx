"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { type SettingsState, saveSettingsAction } from "@/app/(household)/[household]/household/settings/actions";
import ConfirmButton from "@/app/components/ConfirmButton";
import TimezoneSelect from "@/app/components/TimezoneSelect";
import { BRAND } from "@/lib/brand";
import { FEATURES, type Feature } from "@/lib/features";
import { BILLS_PER_PAGE, NAME_MAX, TAGLINE_MAX, type SettingsForm as Values } from "@/lib/settings-form";
import { THEME_COLORS } from "@/lib/theme-tokens";
import type { Household } from "@/lib/types";
import { hourLabel, scheduleSentence } from "./schedule";

export interface SettingsContext {
  zones: string[];
  householdName: string;
  slug: string;
  /** As saved: the confirm dialog compares against these. */
  savedMode: Household["mode"];
  savedPayerId: string;
  members: { id: number; name: string }[];
  overdueEvery: number;
  readout: React.ReactNode;
}

/**
 * The admin's settings form: one form, one Save. Errors come back inline with everything that
 * was typed (useActionState); the schedule sentence and the sender preview follow the inputs as
 * they change, so the effect of a number is readable before saving. The form counts what has
 * changed since it loaded, and on a phone the Save row sticks to the bottom of the screen
 * ("2 changes · Save settings") as soon as anything has, so a long page never hides it.
 */
export default function SettingsForm({ initial, context }: { initial: Values; context: SettingsContext }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, { errors: [] });
  const v = state.values ?? initial;
  // Keyed on the echoed values so a failed save re-seeds the live previews from what was typed.
  return <Fields key={JSON.stringify(v)} v={v} state={state} formAction={formAction} pending={pending} c={context} />;
}

function Fields({ v, state, formAction, pending, c }: { v: Values; state: SettingsState; formAction: (fd: FormData) => void; pending: boolean; c: SettingsContext }) {
  const { zones, householdName, overdueEvery, readout } = c;
  const [mode, setMode] = useState(v.mode);
  const [payerId, setPayerId] = useState(v.payerId || c.savedPayerId || String(c.members[0]?.id ?? ""));
  const [theme, setTheme] = useState(v.theme);
  const [features, setFeatures] = useState(v.features);
  const payerName = c.members.find((m) => String(m.id) === payerId)?.name ?? "the payer";
  // Saving these changes who owns what from now on, so the button asks first.
  const modeChange =
    mode !== c.savedMode
      ? mode === "single_payer"
        ? { title: "Switch to single payer?", body: `Every bill type will belong to ${payerName}, and the dashboard will say what each person owes them. Bills already posted keep the owner they were posted with, so anything still owed on them is owed to whoever fronted it.` }
        : { title: "Switch to a ledger?", body: "Each bill type keeps its current owner, and the owner column comes back so you can hand types to different people. Bills already posted don't change." }
      : mode === "single_payer" && payerId !== c.savedPayerId
        ? { title: `Make ${payerName} the payer?`, body: `Every bill type will belong to ${payerName} from now on. Bills already posted keep their owner.` }
        : null;
  const [enabled, setEnabled] = useState(v.remindersEnabled);
  const [first, setFirst] = useState(v.firstReminderDays);
  const [urgent, setUrgent] = useState(v.urgentReminderDays);
  const [hour, setHour] = useState(v.sendHour);
  const [fromName, setFromName] = useState(v.fromName);
  const sender = `${fromName.replace(/["<>\\]/g, "").trim() || householdName} via ${BRAND.name}`;
  const { formRef, changes, recount } = useChangeCount();

  return (
    <form ref={formRef} action={formAction} className="space-y-8" onChange={recount} onInput={recount}>
      {/* While a mode or payer change is pending, Enter in a field must not save past the
          question: the first submit button is the form's default, and a disabled one blocks
          implicit submission. Save (which asks) is the only way through. */}
      {modeChange && <button type="submit" disabled hidden aria-hidden="true" tabIndex={-1} />}
      {state.errors.length > 0 && (
        <div className="flash flash-err" role="alert">
          <ul className={state.errors.length > 1 ? "list-disc pl-5" : ""}>
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <Group title="Household">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="name">Name</label>
            <input className="field-input" id="name" name="name" defaultValue={v.name} maxLength={NAME_MAX} required autoComplete="off" />
          </div>
          <div>
            <label className="field-label" htmlFor="tagline">Tagline</label>
            <input className="field-input" id="tagline" name="tagline" defaultValue={v.tagline} maxLength={TAGLINE_MAX} placeholder="Optional, like “Utilities, split evenly”" autoComplete="off" />
            <p className="field-hint">Shown beside the name in the header on wider screens.</p>
          </div>
        </div>
        <p className="field-hint">
          Household ID <span className="figure text-ink">{c.slug}</span> stays the same when you rename it.
        </p>

        <fieldset>
          <legend className="field-label">How bills are split</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard name="mode" value="single_payer" checked={mode === "single_payer"} onChange={setMode} title="One person pays every bill">
              Everyone else owes that person their share. The dashboard just says what you owe.
            </ChoiceCard>
            <ChoiceCard name="mode" value="ledger" checked={mode === "ledger"} onChange={setMode} title="Each bill type has an owner">
              Whoever has the account fronts it, and the house ledger shows who owes whom.
            </ChoiceCard>
          </div>
        </fieldset>
        {mode === "single_payer" && (
          <div className="sm:max-w-sm">
            <label className="field-label" htmlFor="payerId">Who pays every bill?</label>
            <select className="field-input" id="payerId" name="payerId" value={payerId} onChange={(e) => setPayerId(e.target.value)}>
              {c.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="field-hint">They own every bill type. Bills already posted keep the owner they had.</p>
          </div>
        )}
      </Group>

      <Group title="Look">
        <fieldset>
          <legend className="field-label">Theme</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <ThemeCard value="statement" checked={theme === "statement"} onChange={setTheme} title="Statement" note="Grey paper, one blue, and a monospace ledger. Follows dark mode if you like." />
            <ThemeCard value="peach" checked={theme === "peach"} onChange={setTheme} title="Peach" note="Cream paper under a striped awning, with a typewriter ledger. Always light." />
          </div>
        </fieldset>
        {theme === "statement" ? (
          <fieldset>
            <legend className="field-label">Dark mode</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input type="radio" name="colorScheme" value="system" defaultChecked={v.colorScheme !== "light"} className="size-4" />
                Match each person&apos;s device
              </label>
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input type="radio" name="colorScheme" value="light" defaultChecked={v.colorScheme === "light"} className="size-4" />
                Always light
              </label>
            </div>
          </fieldset>
        ) : (
          <input type="hidden" name="colorScheme" value="light" />
        )}
        <p className="max-w-[60ch] text-sm text-ink-muted">The theme is for everyone in {householdName}, and household email follows it too.</p>
      </Group>

      <Group title="Features">
        <ul className="divide-y divide-line-soft">
          {(Object.keys(FEATURES) as Feature[]).map((k) => (
            <li key={k} className="py-3 first:pt-0 last:pb-0">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name={`feature_${k}`}
                  checked={features[k]}
                  onChange={(e) => setFeatures({ ...features, [k]: e.target.checked })}
                  className="mt-1 size-4 shrink-0"
                />
                <span>
                  <span className="block text-sm font-semibold">{FEATURES[k].label}</span>
                  <span className="block max-w-[60ch] text-sm text-ink-muted">{FEATURES[k].hint}</span>
                </span>
              </label>
              {k === "rent" && (
                <fieldset disabled={!features.rent} hidden={!features.rent} className="mt-3 grid gap-4 pl-7 sm:grid-cols-3">
                  <legend className="sr-only">Rent</legend>
                  <div>
                    <label className="field-label" htmlFor="monthlyRent">Monthly rent</label>
                    <div className="flex items-center gap-1.5">
                      <span className="figure text-ink-muted" aria-hidden="true">$</span>
                      <input className="field-input figure" id="monthlyRent" name="monthlyRent" inputMode="decimal" defaultValue={v.monthlyRent} placeholder="0.00" autoComplete="off" />
                    </div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="leaseStart">Lease starts</label>
                    <input className="field-input figure" id="leaseStart" name="leaseStart" type="date" defaultValue={v.leaseStart} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="leaseEnd">Lease ends</label>
                    <input className="field-input figure" id="leaseEnd" name="leaseEnd" type="date" defaultValue={v.leaseEnd} />
                  </div>
                  <p className="field-hint sm:col-span-3">Rent shows up on the 1st of each month of the lease in everyone&apos;s calendar feed.</p>
                </fieldset>
              )}
            </li>
          ))}
        </ul>
        {/* A disabled fieldset doesn't submit; keep the saved rent while the feature is off. */}
        {!features.rent && (
          <>
            <input type="hidden" name="monthlyRent" value={v.monthlyRent} />
            <input type="hidden" name="leaseStart" value={v.leaseStart} />
            <input type="hidden" name="leaseEnd" value={v.leaseEnd} />
          </>
        )}
      </Group>

      <Group title="Bills">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="askBillDate" defaultChecked={v.askBillDate} className="mt-1 size-4 shrink-0" />
          <span>
            <span className="block text-sm font-semibold">Ask for the statement date when posting a bill</span>
            <span className="block max-w-[60ch] text-sm text-ink-muted">When it&apos;s off, each bill is dated the day it&apos;s posted.</span>
          </span>
        </label>
        <div className="sm:max-w-48">
          <label className="field-label" htmlFor="billsPerPage">Bills per page</label>
          <select className="field-input figure" id="billsPerPage" name="billsPerPage" defaultValue={v.billsPerPage}>
            {BILLS_PER_PAGE.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </Group>

      <Group title="Reminders">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="remindersEnabled" defaultChecked={v.remindersEnabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-1 size-4" />
          <span>
            <span className="block text-sm font-semibold">Email reminders before bills are due</span>
            <span className="block max-w-[60ch] text-sm text-ink-muted">Only people who still owe get one. The reminder button on each bill works either way.</span>
          </span>
        </label>

        <fieldset disabled={!enabled} className="grid gap-4 disabled:opacity-60 sm:grid-cols-3">
          <legend className="sr-only">Reminder schedule</legend>
          <div>
            <label className="field-label" htmlFor="sendHour">Send at</label>
            <select className="field-input figure" id="sendHour" name="sendHour" defaultValue={v.sendHour} onChange={(e) => setHour(e.target.value)}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>
          <DaysField id="firstReminderDays" label="Heads-up" value={v.firstReminderDays} min={1} onChange={setFirst} />
          <DaysField id="urgentReminderDays" label="Daily from" value={v.urgentReminderDays} min={0} onChange={setUrgent} />
        </fieldset>
        {/* A disabled fieldset doesn't submit; keep the saved schedule when reminders are off. */}
        {!enabled && (
          <>
            <input type="hidden" name="sendHour" value={hour} />
            <input type="hidden" name="firstReminderDays" value={first} />
            <input type="hidden" name="urgentReminderDays" value={urgent} />
          </>
        )}

        <p className="max-w-[60ch] text-sm text-ink-muted" aria-live="polite">
          {enabled ? scheduleSentence({ first, urgent, hour, overdueEvery }) : "No reminder emails go out on their own. People can still be reminded from each bill."}
        </p>
        {readout}
      </Group>

      <Group title="Time">
        <div className="sm:max-w-sm">
          <label className="field-label" htmlFor="timezone">Time zone</label>
          <TimezoneSelect zones={zones} fallback={v.timezone} />
        </div>
        <p className="max-w-[60ch] text-sm text-ink-muted">Today&apos;s date, due-date countdowns and the send time all follow this zone.</p>
      </Group>

      <Group title="Email">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 sm:max-w-sm">
            <label className="field-label" htmlFor="fromName">Sender name</label>
            <input className="field-input" id="fromName" name="fromName" defaultValue={v.fromName} placeholder={householdName} maxLength={80} autoComplete="off" onChange={(e) => setFromName(e.target.value)} />
            <p className="field-hint">
              Inboxes show <span className="font-medium text-ink">{sender}</span>
            </p>
          </div>
          <div>
            <label className="field-label" htmlFor="replyTo">Reply-to address</label>
            <input className="field-input" id="replyTo" name="replyTo" type="email" defaultValue={v.replyTo} autoComplete="off" spellCheck={false} />
            <p className="field-hint">Where replies to household mail go. Reminders and new-bill emails reply to the person who paid the bill instead.</p>
          </div>
          <div>
            <label className="field-label" htmlFor="digestEmail">Digest copies to</label>
            <input className="field-input" id="digestEmail" name="digestEmail" type="email" defaultValue={v.digestEmail} placeholder="Nobody" autoComplete="off" spellCheck={false} />
            <p className="field-hint">Gets a copy of new bills, reminder batches and bulk email. Each copy counts toward the daily email limit, so leave it empty unless someone reads them.</p>
          </div>
        </div>
      </Group>

      <div
        className={`flex items-center justify-end gap-3 border-t border-line-soft pt-5 sm:justify-start ${
          changes > 0 ? "max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-4 max-sm:bg-page max-sm:px-4 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:pt-3" : ""
        }`}
      >
        <span className="mr-auto text-sm text-ink-muted sm:order-last sm:mr-0" aria-live="polite">
          {changes > 0 ? <><span className="figure">{changes}</span> {changes === 1 ? "change" : "changes"} not saved yet</> : ""}
        </span>
        {modeChange ? (
          <ConfirmButton className="btn btn-primary" title={modeChange.title} body={modeChange.body} confirmLabel="Save settings" pendingLabel="Saving…">
            {pending ? "Saving…" : "Save settings"}
          </ConfirmButton>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Save settings"}
          </button>
        )}
      </div>
    </form>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`group-${title}`}>
      <div className="mb-2 flex items-center gap-3">
        <h2 id={`group-${title}`} className="eyebrow">
          {title}
        </h2>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
      </div>
      <div className="panel space-y-4 p-5">{children}</div>
    </section>
  );
}

function DaysField({ id, label, value, min, onChange }: { id: string; label: string; value: string; min: number; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        <input className="field-input figure w-20" id={id} name={id} type="number" inputMode="numeric" min={min} max={30} step={1} defaultValue={value} onChange={(e) => onChange(e.target.value)} required />
        <span className="text-sm text-ink-muted">days before due</span>
      </div>
    </div>
  );
}

function ChoiceCard({ name, value, checked, onChange, title, children }: { name: string; value: string; checked: boolean; onChange: (v: string) => void; title: string; children: React.ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-(--radius-md) border p-4 transition-colors duration-100 ${checked ? "border-accent bg-accent-soft" : "border-line hover:border-ink/40"}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} className="mt-1 size-4 shrink-0" />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-sm text-ink-muted">{children}</span>
      </span>
    </label>
  );
}

/**
 * A theme choice with a small swatch of that theme drawn from its own tokens and faces, so the
 * choice reads before saving (the page itself keeps the saved theme until then).
 */
function ThemeCard({ value, checked, onChange, title, note }: { value: "statement" | "peach"; checked: boolean; onChange: (v: string) => void; title: string; note: string }) {
  const t = THEME_COLORS[value];
  const peach = value === "peach";
  return (
    <label className={`flex cursor-pointer flex-col overflow-hidden rounded-(--radius-md) border transition-colors duration-100 ${checked ? "border-accent ring-1 ring-accent" : "border-line hover:border-ink/40"}`}>
      <span aria-hidden="true" className="block" style={{ background: t.page }}>
        {peach && <span className="block h-1.5" style={{ background: `repeating-linear-gradient(90deg, ${THEME_COLORS.peach.stripeA} 0 14px, ${THEME_COLORS.peach.stripeB} 14px 28px)` }} />}
        <span className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-base font-semibold" style={{ color: t.ink, fontFamily: peach ? "var(--nf-fraunces), Georgia, serif" : "system-ui, sans-serif" }}>
            Hi, Robin
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[0.7rem] font-bold uppercase tracking-[0.08em]" style={{ color: t.paid, background: t.paidSoft, borderRadius: peach ? 9999 : 4, padding: "1px 6px", fontFamily: peach ? "var(--nf-courier), monospace" : "var(--nf-plex), monospace" }}>
              Paid
            </span>
            <span className="text-sm font-semibold tabular-nums" style={{ color: t.ink, fontFamily: peach ? "var(--nf-courier), monospace" : "var(--nf-plex), monospace" }}>
              $26.03
            </span>
          </span>
        </span>
      </span>
      <span className="flex items-start gap-3 border-t border-line-soft p-4">
        <input type="radio" name="theme" value={value} checked={checked} onChange={() => onChange(value)} className="mt-1 size-4 shrink-0" />
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-sm text-ink-muted">{note}</span>
        </span>
      </span>
    </label>
  );
}

/**
 * How many fields differ from what the form showed when it loaded. Fields that only exist on
 * one side (the payer picker appears with single-payer mode) don't count on their own: the
 * choice that revealed them already did.
 */
function useChangeCount() {
  const formRef = useRef<HTMLFormElement>(null);
  const initial = useRef<Map<string, string> | null>(null);
  const [changes, setChanges] = useState(0);
  const snapshot = (form: HTMLFormElement) => {
    const out = new Map<string, string>();
    const fd = new FormData(form);
    for (const name of new Set(fd.keys())) out.set(name, JSON.stringify(fd.getAll(name).map(String)));
    return out;
  };
  useEffect(() => {
    if (formRef.current) initial.current = snapshot(formRef.current);
  }, []);
  // After React has re-rendered whatever the change revealed or hid.
  const recount = () =>
    setTimeout(() => {
      const form = formRef.current;
      const before = initial.current;
      if (!form || !before) return;
      const now = snapshot(form);
      let n = 0;
      for (const [name, value] of now) if (before.has(name) && before.get(name) !== value) n++;
      setChanges(n);
    });
  return { formRef, changes, recount };
}

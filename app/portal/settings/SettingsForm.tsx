"use client";

import { useActionState, useState } from "react";
import { type SettingsState, saveSettingsAction } from "@/app/portal/settings/actions";
import TimezoneSelect from "@/app/components/TimezoneSelect";
import { BRAND } from "@/lib/brand";
import type { SettingsForm as Values } from "@/lib/settings";
import { hourLabel, scheduleSentence } from "./schedule";

/**
 * The admin's settings form: one form, one Save. Errors come back inline with everything that
 * was typed (useActionState); the schedule sentence and the sender preview follow the inputs as
 * they change, so the effect of a number is readable before saving.
 */
export default function SettingsForm({
  initial,
  zones,
  householdName,
  overdueEvery,
  readout,
}: {
  initial: Values;
  zones: string[];
  householdName: string;
  overdueEvery: number;
  readout: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, { errors: [] });
  const v = state.values ?? initial;
  // Keyed on the echoed values so a failed save re-seeds the live previews from what was typed.
  return <Fields key={JSON.stringify(v)} v={v} state={state} formAction={formAction} pending={pending} zones={zones} householdName={householdName} overdueEvery={overdueEvery} readout={readout} />;
}

function Fields({
  v,
  state,
  formAction,
  pending,
  zones,
  householdName,
  overdueEvery,
  readout,
}: {
  v: Values;
  state: SettingsState;
  formAction: (fd: FormData) => void;
  pending: boolean;
  zones: string[];
  householdName: string;
  overdueEvery: number;
  readout: React.ReactNode;
}) {
  const [enabled, setEnabled] = useState(v.remindersEnabled);
  const [first, setFirst] = useState(v.firstReminderDays);
  const [urgent, setUrgent] = useState(v.urgentReminderDays);
  const [hour, setHour] = useState(v.sendHour);
  const [fromName, setFromName] = useState(v.fromName);
  const sender = `${fromName.replace(/["<>\\]/g, "").trim() || householdName} via ${BRAND.name}`;

  return (
    <form action={formAction} className="space-y-8">
      {state.errors.length > 0 && (
        <div className="flash flash-err" role="alert">
          <ul className={state.errors.length > 1 ? "list-disc pl-5" : ""}>
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <Group title="Reminders">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="remindersEnabled" defaultChecked={v.remindersEnabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-1 size-4 accent-(--accent)" />
          <span>
            <span className="block text-sm font-semibold">Email reminders before bills are due</span>
            <span className="block text-sm text-ink-muted">Only people who still owe get one. The reminder button on each bill works either way.</span>
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

        <p className="text-sm text-ink-muted" aria-live="polite">
          {enabled ? scheduleSentence({ first, urgent, hour, overdueEvery }) : "No reminder emails go out on their own. People can still be reminded from each bill."}
        </p>
        {readout}
      </Group>

      <Group title="Time">
        <div className="sm:max-w-sm">
          <label className="field-label" htmlFor="timezone">Time zone</label>
          <TimezoneSelect zones={zones} fallback={v.timezone} />
        </div>
        <p className="text-sm text-ink-muted">Today&apos;s date, due-date countdowns and the send time all follow this zone.</p>
      </Group>

      <Group title="Email">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 sm:max-w-sm">
            <label className="field-label" htmlFor="fromName">Sender name</label>
            <input className="field-input" id="fromName" name="fromName" defaultValue={v.fromName} placeholder={householdName} maxLength={80} autoComplete="off" onChange={(e) => setFromName(e.target.value)} />
            <p className="mt-1 text-xs text-ink-muted">
              Inboxes show <span className="font-medium text-ink">{sender}</span>
            </p>
          </div>
          <div>
            <label className="field-label" htmlFor="replyTo">Reply-to address</label>
            <input className="field-input" id="replyTo" name="replyTo" type="email" defaultValue={v.replyTo} autoComplete="off" spellCheck={false} />
            <p className="mt-1 text-xs text-ink-muted">Where replies to household mail go. Reminders and new-bill emails reply to the person who paid the bill instead.</p>
          </div>
          <div>
            <label className="field-label" htmlFor="digestEmail">Digest copies to</label>
            <input className="field-input" id="digestEmail" name="digestEmail" type="email" defaultValue={v.digestEmail} placeholder="Nobody" autoComplete="off" spellCheck={false} />
            <p className="mt-1 text-xs text-ink-muted">Gets a copy of new bills, reminder batches and bulk email. Each copy counts toward the daily email limit, so leave it empty unless someone reads them.</p>
          </div>
        </div>
      </Group>

      <div className="flex items-center gap-3 border-t border-line-soft pt-5">
        <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
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

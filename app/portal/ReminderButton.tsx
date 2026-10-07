"use client";

import ConfirmButton from "@/app/components/ConfirmButton";
import { EnvelopeIcon } from "@/app/components/icons";
import { sendReminder } from "@/app/portal/actions";

export default function ReminderButton({ billId, typeName }: { billId: number; typeName: string }) {
  return (
    <form action={sendReminder} className="inline">
      <input type="hidden" name="billId" value={billId} />
      <ConfirmButton
        // Icon-only from sm; on a phone (no hover titles) the action row has room for the word.
        className="btn-icon max-sm:w-auto max-sm:gap-1.5 max-sm:px-3"
        buttonProps={{ title: "Send reminder email", "aria-label": `Remind everyone who owes on ${typeName}` }}
        title={`Remind everyone who owes on ${typeName}?`}
        body="Each person who hasn't paid gets one email now. It counts toward the household's daily email limit."
        confirmLabel="Send reminder"
        pendingLabel="Sending…"
      >
        <EnvelopeIcon />
        <span className="text-[0.8rem] font-medium text-ink sm:hidden">Remind</span>
      </ConfirmButton>
    </form>
  );
}

"use client";

import ConfirmButton from "@/app/components/ConfirmButton";
import { EnvelopeIcon } from "@/app/components/icons";
import { sendReminder } from "@/app/portal/actions";

export default function ReminderButton({ billId, typeName }: { billId: number; typeName: string }) {
  return (
    <form action={sendReminder} className="inline">
      <input type="hidden" name="billId" value={billId} />
      <ConfirmButton
        className="btn-icon"
        buttonProps={{ title: "Send reminder email", "aria-label": `Send a reminder about ${typeName}` }}
        title={`Remind everyone who owes on ${typeName}?`}
        body="Each person who hasn't paid gets one email now. It counts toward the household's daily email limit."
        confirmLabel="Send reminder"
        pendingLabel="Sending…"
      >
        <EnvelopeIcon />
      </ConfirmButton>
    </form>
  );
}

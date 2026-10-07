"use client";

import { EnvelopeIcon } from "@/app/components/icons";
import { sendReminder } from "@/app/portal/actions";

export default function ReminderButton({ billId }: { billId: number }) {
  return (
    <form
      action={sendReminder}
      onSubmit={(e) => {
        if (!confirm("Email a reminder to everyone who still owes on this bill?")) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="billId" value={billId} />
      <button type="submit" className="btn-icon" title="Send reminder email" aria-label="Send reminder">
        <EnvelopeIcon />
      </button>
    </form>
  );
}

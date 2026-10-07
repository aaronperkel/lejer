"use client";

import { useFormStatus } from "react-dom";
import Dialog, { DialogFooter } from "@/app/components/Dialog";

/**
 * A button that asks first. Placed inside a <form>, it opens the shared Dialog and only the
 * dialog's confirm button submits the form. For destructive or consequential actions: removing
 * someone, deleting a bill or a file, switching the household's mode. Cancel is focused first,
 * so Enter never confirms by accident.
 */
export default function ConfirmButton({
  children,
  title,
  body,
  confirmLabel,
  pendingLabel,
  className = "btn",
  buttonProps,
}: {
  children: React.ReactNode;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  className?: string;
  buttonProps?: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "onClick" | "className">;
}) {
  const { pending } = useFormStatus();
  return (
    <Dialog
      title={title}
      description={<div className="pb-4">{body}</div>}
      trigger={(open) => (
        <button type="button" className={className} disabled={pending} aria-haspopup="dialog" onClick={open} {...buttonProps}>
          {children}
        </button>
      )}
    >
      {(close) => (
        <DialogFooter>
          <button type="button" className="btn" autoFocus onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending} onClick={() => setTimeout(close)}>
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </button>
        </DialogFooter>
      )}
    </Dialog>
  );
}

"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";

/**
 * A button that asks first. Placed inside a <form>, it opens a native modal <dialog> (focus is
 * trapped, Escape and the backdrop cancel, focus returns to the button) and only the dialog's
 * confirm button submits the form. For destructive or consequential actions: removing someone,
 * deleting a file, switching the household's mode. Cancel is focused first, so Enter never
 * confirms by accident.
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
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const { pending } = useFormStatus();

  return (
    <>
      <button type="button" className={className} disabled={pending} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()} {...buttonProps}>
        {children}
      </button>
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        // A click on the backdrop lands on the <dialog> itself, never on its contents.
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        <div className="px-5 pb-4 pt-5 text-left">
          <h2 id={titleId} className="display text-lg font-semibold leading-snug">
            {title}
          </h2>
          <div id={bodyId} className="mt-2 text-sm text-ink-muted">
            {body}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-5 py-3">
          <button type="button" className="btn" autoFocus onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending} onClick={() => setTimeout(() => dialog.current?.close())}>
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}

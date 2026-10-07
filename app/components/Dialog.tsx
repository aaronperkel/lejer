"use client";

import { useId, useImperativeHandle, useRef } from "react";

export interface DialogHandle {
  open: () => void;
  close: () => void;
}

/**
 * The one modal in the app: a native <dialog> panel (.dialog) opened by a trigger. The browser
 * traps focus and closes it on Escape; a click on the backdrop closes it too, and focus goes
 * back to whatever opened it. The title is in the display voice (Fraunces in peach).
 * ConfirmButton asks with it; form dialogs (a bill type, a bill) put their form inside.
 */
export default function Dialog({
  title,
  description,
  trigger,
  children,
  wide = false,
  handle,
}: {
  title: string;
  description?: React.ReactNode;
  /** Renders the opener; call `open` from its onClick. */
  trigger: (open: () => void) => React.ReactNode;
  /** The body; `close` dismisses the dialog (Cancel, or after a successful submit). */
  children?: (close: () => void) => React.ReactNode;
  wide?: boolean;
  /** For callers that close it themselves (a form dialog after a save went through). */
  handle?: React.Ref<DialogHandle>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const open = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  useImperativeHandle(handle, () => ({ open, close }));

  return (
    <>
      {trigger(open)}
      <dialog
        ref={dialog}
        className={`dialog ${wide ? "dialog-wide" : ""}`}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        // A click on the backdrop lands on the <dialog> itself, never on its contents.
        onClick={(e) => e.target === e.currentTarget && close()}
        onClose={() => opener.current?.isConnected && opener.current.focus()}
      >
        <div className="px-5 pt-5 text-left">
          <h2 id={titleId} className="display text-lg font-semibold leading-snug">
            {title}
          </h2>
          {description && (
            <div id={descriptionId} className="mt-2 text-sm text-ink-muted">
              {description}
            </div>
          )}
        </div>
        {children?.(close)}
      </dialog>
    </>
  );
}

/** The padded area under the title. */
export function DialogBody({ children }: { children: React.ReactNode }) {
  return <div className="px-5 pb-5 pt-4 text-left">{children}</div>;
}

/** The ruled footer: actions on the right, Cancel first. */
export function DialogFooter({ children, start }: { children: React.ReactNode; start?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-5 py-3">
      {start && <div className="mr-auto">{start}</div>}
      {children}
    </div>
  );
}

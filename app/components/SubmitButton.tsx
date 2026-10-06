"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that disables itself while the surrounding form's server
 * action is pending — otherwise a slow action (an email send) invites double-taps
 * that fire the action once per tap.
 */
export default function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

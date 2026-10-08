import Link from "next/link";
import SubmitButton from "@/app/components/SubmitButton";
import { requestCode } from "@/app/(site)/login/actions";

// The real sign-up: the same email-code request as /login. A new address gets a code and the
// verified code creates the account; it lands on /login's code step either way, then on
// onboarding (/new) for a new account or the household for a returning one. The heading above
// the form is its visible label; the field's own label is for assistive tech.
export default function Signup({ id, demo = true }: { id: string; demo?: boolean }) {
  return (
    <form action={requestCode} className="s-signup">
      <label htmlFor={id} className="sr-only">
        Your email address
      </label>
      <div className="s-signup-row">
        <input className="s-input" type="email" id={id} name="email" autoComplete="email" placeholder="you@example.com" required />
        <SubmitButton className="s-btn" pendingLabel="Sending code…">
          Email me a code
        </SubmitButton>
      </div>
      <p className="s-hint">
        We&apos;ll email you a 6-digit code. No password, and if you&apos;re new the same code creates your account.
        {demo && (
          <>
            {" "}
            <Link className="s-link s-demo-link" href="/demo">
              Or look around the demo first
              <Arrow />
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

export function Arrow() {
  return (
    <svg className="s-arrow" viewBox="0 0 18 10" aria-hidden="true">
      <path d="M0 5h16M12 1l4 4-4 4" />
    </svg>
  );
}

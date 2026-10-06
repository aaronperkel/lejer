import type { Metadata } from "next";
import Link from "next/link";
import SubmitButton from "@/app/components/SubmitButton";
import { safeNext } from "@/lib/flash";
import { requestCode, submitCode } from "./actions";

export const metadata: Metadata = { title: "Sign in — Lejer" };

const ERRORS: Record<string, string> = {
  "bad-email": "That doesn't look like an email address.",
  "rate-limited": "Too many codes requested. Wait a few minutes and try again.",
  "daily-cap": "Sign-in is busy right now. Try again later today.",
  "send-failed": "Couldn't send the email. Wait a minute and try again.",
  "bad-code": "Wrong code. Check the email and try again.",
  expired: "That code expired or was used up. Request a fresh one.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const err = one(sp.err);
  const email = one(sp.email);
  const step = one(sp.step);
  const next = safeNext(one(sp.next));

  const flash = err && <div className="flash flash-err" role="alert">{ERRORS[err] ?? "Something went wrong."}</div>;
  const restart = `/login?${new URLSearchParams({ ...(email ? { email } : {}), ...(next !== "/" ? { next } : {}) })}`;

  return (
    <main className="mx-auto max-w-sm py-10 sm:py-16">
      <div className="panel p-6">
        <span className="eyebrow mb-1">Lejer</span>
        <h1 className="text-lg font-bold">Sign in</h1>
        {step === "code" && email ? (
          <>
            <p className="mt-1 mb-5 text-sm text-ink-muted">
              We sent a 6-digit code to <strong className="text-ink">{email}</strong>. It expires in 10 minutes.
            </p>
            {flash}
            <form action={submitCode}>
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="email" value={email} />
              <label className="field-label" htmlFor="code">Code</label>
              <input
                className="field-input figure text-center text-xl tracking-[0.35em]"
                type="text"
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="······"
                autoFocus
                required
              />
              <SubmitButton className="btn btn-primary mt-5 w-full" pendingLabel="Signing in…">
                Sign in
              </SubmitButton>
            </form>
            <p className="mt-4 text-center text-sm">
              <Link className="text-ink-muted underline" href={restart}>Request a new code</Link>
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 mb-5 text-sm text-ink-muted">
              Enter your email and we&apos;ll send you a one-time sign-in code. New here? The same code
              creates your account.
            </p>
            {flash}
            <form action={requestCode}>
              <input type="hidden" name="next" value={next} />
              <label className="field-label" htmlFor="email">Email</label>
              <input
                className="field-input"
                type="email"
                id="email"
                name="email"
                autoComplete="email"
                defaultValue={email}
                autoFocus
                required
              />
              <SubmitButton className="btn btn-primary mt-5 w-full" pendingLabel="Sending code…">
                Email me a code
              </SubmitButton>
            </form>
            <p className="mt-4 text-center text-sm">
              <Link className="text-ink-muted underline" href="/demo">Look around the demo first</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

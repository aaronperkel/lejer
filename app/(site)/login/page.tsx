import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SubmitButton from "@/app/components/SubmitButton";
import { Arrow } from "../Signup";
import { getSessionUser, homePath } from "@/lib/context";
import { safeNext } from "@/lib/flash";
import { requestCode, submitCode } from "./actions";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Sign in" };

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
  // Already signed in: "Sign in" goes straight to the household, like any app's. Not on the
  // code step, which someone signing in as another address reaches from the site's form.
  const user = step === "code" ? null : await getSessionUser();
  if (user) redirect(next !== "/" ? next : await homePath(user));

  const flash = err && (
    <p className="s-alert" role="alert">
      {ERRORS[err] ?? "Something went wrong."}
    </p>
  );
  const restart = `/login?${new URLSearchParams({ ...(email ? { email } : {}), ...(next !== "/" ? { next } : {}) })}`;

  // The site's own look (DESIGN.md "Public Site"): most sign-ins start at the home page's form,
  // so the code step carries on from it rather than switching to a household theme.
  return (
    <main className="s-wrap s-login">
      {step === "code" && email ? (
        <>
          <span className="s-key">Step 2 of 2</span>
          <h1 className="s-h1">Check your email.</h1>
          <p className="s-lede">
            We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
          </p>
          <form action={submitCode} className="s-login-form">
            {flash}
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="email" value={email} />
            <label className="s-label" htmlFor="code">Sign-in code</label>
            <input
              className="s-input s-code"
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
            <SubmitButton className="s-btn" pendingLabel="Signing in…">
              Sign in
            </SubmitButton>
          </form>
          <p className="s-hint">
            Nothing yet? Check spam, or{" "}
            <Link className="s-link" href={restart}>
              request a new code
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <span className="s-key">Sign in or sign up</span>
          <h1 className="s-h1">Sign in to {BRAND.name}.</h1>
          <p className="s-lede">
            Enter your email and we&apos;ll send you a one-time code. No password, and if you&apos;re new the same code creates
            your account.
          </p>
          <form action={requestCode} className="s-login-form">
            {flash}
            <label className="s-label" htmlFor="email">Email</label>
            <input type="hidden" name="next" value={next} />
            <input
              className="s-input"
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              defaultValue={email}
              autoFocus
              required
            />
            <SubmitButton className="s-btn" pendingLabel="Sending code…">
              Email me a code
            </SubmitButton>
          </form>
          <p className="s-hint">
            <Link className="s-link s-demo-link" href="/demo">
              Or look around the demo first
              <Arrow />
            </Link>
          </p>
        </>
      )}
    </main>
  );
}

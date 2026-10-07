import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SubmitButton from "@/app/components/SubmitButton";
import { getCtx, getSessionUser } from "@/lib/context";
import { devBypass, endSession, startDemo } from "@/lib/session";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Demo" };

async function signOutToDemo(): Promise<void> {
  "use server";
  await endSession();
  await startDemo();
  redirect("/");
}

export default async function DemoSignedInPage() {
  const user = await getSessionUser();
  if (!user) redirect("/demo");
  const ctx = await getCtx();
  const where = ctx ? ctx.household.name : BRAND.name;

  return (
    <main className="mx-auto max-w-sm py-10 sm:py-16">
      <div className="panel p-6">
        <span className="eyebrow mb-1">Demo</span>
        <h1 className="mb-2 text-lg font-bold">You&apos;re signed in to {where}</h1>
        <p className="mb-5 text-sm text-ink-muted">Sign out to view the demo, or go back.</p>
        {devBypass() ? (
          <p className="flash flash-err">APP_DEV_USER is set, so signing out has no effect. Unset it to view the demo.</p>
        ) : (
          <form action={signOutToDemo}>
            <SubmitButton className="btn btn-primary w-full" pendingLabel="Signing out…">
              Sign out and view the demo
            </SubmitButton>
          </form>
        )}
        <p className="mt-4 text-center text-sm">
          <Link className="text-ink-muted underline" href="/">Go back</Link>
        </p>
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";

// Server-action outcomes travel as ?ok= / ?err= on the page they return to; <Flash> renders
// them. Plain functions (not server actions): call them from inside an action, never from a
// try block (redirect() throws).

export function done(path: string, message: string): never {
  redirect(`${path}?${new URLSearchParams({ ok: message })}`);
}

export function fail(path: string, message: string): never {
  redirect(`${path}?${new URLSearchParams({ err: message })}`);
}

/** A same-origin path to return to after sign-in: "/x" yes; "//host", "/\host", "x" no. */
export function safeNext(raw: unknown): string {
  const next = typeof raw === "string" ? raw : "";
  return /^\/(?![/\\])[^\s\\]*$/.test(next) ? next : "/";
}

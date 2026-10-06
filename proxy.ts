import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_COOKIE,
  RENEW_AFTER_SECONDS,
  SESSION_COOKIE,
  cookieOptions,
  createSessionToken,
  devBypass,
  readDemoToken,
  readSessionToken,
} from "@/lib/session";

// First lock only: a valid session (or demo) cookie for everything that isn't public.
// Pages and server actions still authorize themselves (lib/auth.ts); hid is validated
// against memberships in getCtx(), not here.

// Public surfaces. /api/documents/upload is public because Blob's upload-completed callback
// carries no cookie; the route gates token minting on requireAdminAction() itself.
const PUBLIC = [
  /^\/login(?:\/|$)/,
  /^\/demo(?:\/|$)/,
  /^\/cal\.ics$/,
  /^\/api\/cron(?:\/|$)/,
  /^\/api\/documents\/upload$/,
  /^\/no-access$/,
];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((re) => re.test(path)) || devBypass()) return NextResponse.next();

  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const res = NextResponse.next();
    if (Date.now() / 1000 - session.issuedAt > RENEW_AFTER_SECONDS) {
      res.cookies.set(SESSION_COOKIE, await createSessionToken(session.uid, session.hid), cookieOptions());
    }
    return res;
  }
  if (await readDemoToken(req.cookies.get(DEMO_COOKIE)?.value)) return NextResponse.next();

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (path !== "/") login.searchParams.set("next", path + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!_next/|favicon\\.ico|icon|apple-icon|opengraph-image|robots\\.txt|site\\.webmanifest).*)",
  ],
};

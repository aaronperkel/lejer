import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SLUG, HOUSEHOLD_HEADER, householdSlugOf } from "@/lib/paths";
import {
  HOUSEHOLD_COOKIE,
  RENEW_AFTER_SECONDS,
  SESSION_COOKIE,
  cookieOptions,
  createSessionToken,
  devBypass,
  readSessionToken,
} from "@/lib/session";
import { SITE_PAGES } from "@/lib/site";

// First lock only: a valid session cookie for everything that isn't public. Pages and server
// actions still authorize themselves (lib/auth.ts), and getCtx() checks the household the URL
// names against memberships; this file only reads the slug off the path (lib/paths.ts).

// Public surfaces. /api/documents/upload is public because Blob's upload-completed callback
// carries no cookie; the route gates token minting on admin of the key's household itself.
const PUBLIC = [
  /^\/login(?:\/|$)/,
  /^\/cal\.ics$/,
  /^\/api\/cron(?:\/|$)/,
  /^\/api\/documents\/upload$/,
];

/** How long the last-opened-household cookie lasts; refreshed on every visit. */
const HOUSEHOLD_COOKIE_DAYS = 365;

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const slug = householdSlugOf(path);

  // The URL's household, for getCtx(). Whatever the client sent under this name is dropped.
  const headers = new Headers(req.headers);
  headers.delete(HOUSEHOLD_HEADER);
  if (slug) headers.set(HOUSEHOLD_HEADER, slug);
  const pass = () => NextResponse.next({ request: { headers } });
  /** A signed-in GET of a household page: remember it as where "Sign in" goes next time. */
  const remember = (res: NextResponse) => {
    if (slug && slug !== DEMO_SLUG && req.method === "GET" && req.cookies.get(HOUSEHOLD_COOKIE)?.value !== slug) {
      res.cookies.set(HOUSEHOLD_COOKIE, slug, cookieOptions(HOUSEHOLD_COOKIE_DAYS));
    }
    return res;
  };

  // The public site, sign-in and the demo household need no session.
  if (SITE_PAGES.test(path) || PUBLIC.some((re) => re.test(path)) || slug === DEMO_SLUG) return pass();
  if (devBypass()) return remember(pass());

  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const res = remember(pass());
    if (Date.now() / 1000 - session.issuedAt > RENEW_AFTER_SECONDS) {
      res.cookies.set(SESSION_COOKIE, await createSessionToken(session.uid), cookieOptions());
    }
    return res;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("next", path + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!_next/|favicon\\.ico|icon|apple-icon|opengraph-image|robots\\.txt|site\\.webmanifest).*)",
  ],
};

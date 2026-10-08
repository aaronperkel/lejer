// Household URLs (ARCHITECTURE.md §5, "Household URLs"). Every household page lives under its slug:
// /oak-lane is the dashboard, /oak-lane/bills its bills, and so on; "/" is the public site
// for everyone. proxy.ts reads the slug off the path and hands it to getCtx() in a request
// header; getCtx() checks it against the viewer's memberships, so the URL picks the household
// and the membership authorizes it.
// Plain module (no Next imports): the proxy and the email templates import it too.

/** The shape households.slug allows (0001_init.sql's CHECK). */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The in-memory demo household (lib/demo.ts) lives at /demo; no session needed. */
export const DEMO_SLUG = "demo";

/**
 * First path segments no household may take: every top-level route in app/ (the identity
 * verify suite checks that each one is listed), plus names a public site tends to grow into.
 * Adding a top-level route means adding its name here first; a household that already has
 * the name would have to be renamed by hand.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // app/ today
  "about", "account", "api", "files", "households", "how-it-works", "login", "new",
  DEMO_SLUG,
  // Next's own and metadata routes
  "apple-icon", "favicon", "icon", "manifest", "opengraph-image", "robots", "sitemap", "twitter-image",
  // URLs from before households had their own (never shared outside dev)
  "documents", "home", "no-access", "portal", "trends", "welcome",
  // room to grow
  "admin", "app", "assets", "auth", "blog", "careers", "changelog", "contact", "dashboard", "docs",
  "download", "faq", "features", "help", "invite", "join", "legal", "logout", "mail", "news",
  "press", "pricing", "privacy", "security", "settings", "sign-in", "sign-up", "signin", "signout",
  "signup", "static", "status", "support", "team", "terms", "www",
]);

export const isReservedSlug = (slug: string): boolean => RESERVED_SLUGS.has(slug);

/**
 * Request header carrying the URL's household slug from proxy.ts to getCtx(). The proxy
 * always deletes any copy the client sent before setting its own.
 */
export const HOUSEHOLD_HEADER = "x-household";

/** The household a path names ("/oak-lane/bills" → "oak-lane", "/demo" → "demo"), or null. */
export function householdSlugOf(pathname: string): string | null {
  const seg = pathname.split("/")[1] ?? "";
  if (seg === DEMO_SLUG) return seg;
  return SLUG_RE.test(seg) && !isReservedSlug(seg) ? seg : null;
}

/** A path inside a household: householdPath(h) is its dashboard, householdPath(h, "/bills") its bills page. */
export function householdPath(h: { slug: string }, path = ""): string {
  return `/${h.slug}${path}`;
}

// The product's name and addresses, in one place: the name may change before launch.
// Everything user-visible (page titles, copy, email, From addresses) and every cookie name reads
// from here; nothing else spells them out (`npm run verify` checks for stray literals).
// Renaming changes the cookie names, which signs everyone out once; that's accepted.
// Not covered: infrastructure identifiers (the lejer_app Postgres role, the Neon/Vercel project
// names, the npm package name), which change by migration, not by editing this file.
// Plain constants, so email templates (rendered outside Next) can import it too.

const NAME = "Lejer";
const DOMAIN = "lejer.app";
const MAIL_SUBDOMAIN = `mail.${DOMAIN}`;
const COOKIE_PREFIX = "lejer";

export const BRAND = {
  name: NAME,
  domain: DOMAIN,
  /** Production URL; NEXT_PUBLIC_APP_URL overrides it per environment (see appUrl()). */
  url: `https://${DOMAIN}`,
  mailDomain: MAIL_SUBDOMAIN,
  /** Account mail: login codes and invites. Display name is the product name, no Reply-To. */
  loginFrom: `login@${MAIL_SUBDOMAIN}`,
  /** Household mail, sent as "{household} via {name}". */
  notifyFrom: `notify@${MAIL_SUBDOMAIN}`,
  cookies: {
    session: `${COOKIE_PREFIX}_session`,
    demo: `${COOKIE_PREFIX}_demo`,
  },
} as const;

/** Absolute URL for this deployment (links in email, metadataBase). */
export function appUrl(path = "/"): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || BRAND.url).replace(/\/+$/, "");
  return `${base}${path}`;
}

// The public site (home, how it works, about), in its own root layout at app/(site)/layout.tsx.
// "/" is the home page for everyone, signed in or not; households live at /{slug}
// (lib/paths.ts). proxy.ts lets these pages through without a session.

/** Site pages anyone can open, signed in or not. */
export const SITE_PAGES = /^\/(?:how-it-works|about)?$/;

/** The site's pages besides home (the wordmark is the way home), for the header and footer. */
export const SITE_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];

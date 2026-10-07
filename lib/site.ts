// The public site (home, how it works, about), in its own root layout at app/(site)/layout.tsx.
// proxy.ts lets its pages through without a session and rewrites a signed-out "/" to SITE_HOME.

/** Site pages anyone can open, signed in or not. "/" is the site only without a session. */
export const SITE_PAGES = /^\/(?:how-it-works|about)$/;

/** Where "/" is rewritten for signed-out visitors. Requested directly, it redirects to "/". */
export const SITE_HOME = "/home";

/** The site's pages, numbered like the sheets of a drawing set (the header's sheet index). */
export const SHEETS = [
  { no: "A-101", href: "/", label: "Home" },
  { no: "A-201", href: "/how-it-works", label: "How it works" },
  { no: "A-301", href: "/about", label: "About" },
];

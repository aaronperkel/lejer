// The public site (home, how it works, about), in its own root layout at app/(site)/layout.tsx.
// "/" is the home page for everyone, signed in or not; households live at /{slug}
// (lib/paths.ts). proxy.ts lets these pages through without a session.

/** Site pages anyone can open, signed in or not. */
export const SITE_PAGES = /^\/(?:how-it-works|about)?$/;

/** The site's pages, numbered like the sheets of a drawing set (the header's sheet index). */
export const SHEETS = [
  { no: "A-101", href: "/", label: "Home" },
  { no: "A-201", href: "/how-it-works", label: "How it works" },
  { no: "A-301", href: "/about", label: "About" },
];

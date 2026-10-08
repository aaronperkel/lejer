import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Bill PDFs ride the addBill server action: 4 MB file (checked in the action) plus the form
    // fields, under Vercel's 4.5 MB request cap. Documents upload browser → Blob instead.
    serverActions: { bodySizeLimit: "4.4mb" },
    // Two root layouts (app/(app) and app/(site)) leave no single layout for an unmatched URL;
    // app/global-not-found.tsx is that page.
    globalNotFound: true,
  },
  // A household's "Portal" became Bills and Household (2026-10). Emails already sent link to the
  // old paths, so they keep working. Config redirects run before proxy.ts, so a signed-out visit
  // lands on /login?next=<the new path>. Not permanent: browsers would cache a 308 for good.
  async redirects() {
    return [
      { source: "/:slug/portal", destination: "/:slug/bills", permanent: false },
      { source: "/:slug/portal/household", destination: "/:slug/household", permanent: false },
      { source: "/:slug/portal/:tab(settings|email)", destination: "/:slug/household/:tab", permanent: false },
    ];
  },
};

export default nextConfig;

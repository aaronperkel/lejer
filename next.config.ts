import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Bill PDFs ride the addBill server action: 4 MB file (checked in the action) plus the form
    // fields, under Vercel's 4.5 MB request cap. Documents upload browser → Blob instead.
    serverActions: { bodySizeLimit: "4.4mb" },
  },
};

export default nextConfig;

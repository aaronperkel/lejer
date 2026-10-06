import type { VercelConfig } from "@vercel/config/v1";

// iad1 sits next to Neon's aws-us-east-1. The hourly cron ping comes from
// GitHub Actions (.github/workflows/tick.yml), not Vercel Cron — Hobby crons
// run once a day, which would defeat the per-household send hour.
export const config: VercelConfig = {
  framework: "nextjs",
  regions: ["iad1"],
};

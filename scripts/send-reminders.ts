// npm run send-reminders -- --household <slug> [--force]
//
// Runs one household's tick by hand: the same lib/cron.ts code the hourly endpoint runs, minus
// the send-hour wait. It still claims the day (so the cron won't send a second round today) and
// still respects the daily email budget; --force skips both. Real mail goes out unless
// RESEND_API_KEY is empty (console mode).
//
// The slug lookup is one of the owner-role call sites (CLAUDE.md): under RLS, lejer_app can't
// find a household it isn't already scoped to. Everything after it runs as lejer_app.

import { tickHousehold } from "@/lib/cron";
import { adminSql } from "@/lib/db";

async function main() {
  const args = process.argv.slice(2);
  const slug = args[args.indexOf("--household") + 1];
  if (!args.includes("--household") || !slug || slug.startsWith("--")) {
    console.error("usage: npm run send-reminders -- --household <slug> [--force]");
    process.exit(2);
  }
  const force = args.includes("--force");

  const [h] = await adminSql()<{ id: number }[]>`SELECT id FROM households WHERE slug = ${slug}`;
  if (!h) {
    console.error(`no household with slug "${slug}"`);
    process.exit(1);
  }

  const result = await tickHousehold(h.id, { ignoreHour: true, force });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.tried && result.sent === 0 ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  // The app role's pool idles for 20 s before letting go; don't wait for it.
  .finally(async () => {
    await adminSql().end();
    process.exit(process.exitCode ?? 0);
  });

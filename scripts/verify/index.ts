// `npm run verify`: the second gate after `npm run build`. Runs every suite against the Neon
// dev branch (and refuses anything else), on throwaway households it creates and removes.
// Every phase adds its checks here. Usage: npm run verify [-- rls identity …] to pick suites.

import { adminSql } from "@/lib/db";
import { bills } from "./bills";
import { brand } from "./brand";
import { cron } from "./cron";
import { edits } from "./edits";
import { emails } from "./emails";
import { features } from "./features";
import { Results, connectDev, sweep } from "./harness";
import { http } from "./http";
import { identity } from "./identity";
import { rls } from "./rls";
import { tokens } from "./tokens";

const SUITES = { brand, tokens, emails, rls, identity, bills, cron, edits, features, http } as const;

async function main() {
  const picked = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  for (const p of picked) if (!(p in SUITES)) throw new Error(`unknown suite "${p}" (have: ${Object.keys(SUITES).join(", ")})`);
  const names = (picked.length ? picked : Object.keys(SUITES)) as (keyof typeof SUITES)[];

  const conns = await connectDev();
  const results = new Results();
  await sweep(conns.owner);
  try {
    for (const name of names) {
      try {
        await SUITES[name](results, conns);
      } catch (e) {
        results.check(`${name} suite crashed`, false, e instanceof Error ? e.stack : String(e));
      }
    }
  } finally {
    await sweep(conns.owner);
    await Promise.all([conns.owner.end(), conns.app.end(), conns.appDirect.end(), adminSql().end()]);
  }

  console.log(`\n${results.passed} passed, ${results.failed.length} failed`);
  for (const f of results.failed) console.log(`  FAIL ${f}`);
  process.exit(results.failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

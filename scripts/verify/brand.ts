// The brand lives in lib/brand.ts (the name may change before launch). This fails the gate if
// a literal name, domain or cookie name creeps back into code or email templates. Docs, SQL
// migrations and the lejer_app Postgres role are out of scope by design.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { BRAND } from "@/lib/brand";
import { DEMO_COOKIE, SESSION_COOKIE } from "@/lib/session";
import type { Results } from "./harness";

const ROOT = path.join(import.meta.dirname, "..", "..");
const SCAN = ["app", "lib", "emails", "proxy.ts", "instrumentation.ts", "scripts"];
const ALLOW = new Set(["lib/brand.ts", "scripts/verify/brand.ts"]);

function files(rel: string): string[] {
  const abs = path.join(ROOT, rel);
  if (statSync(abs).isFile()) return /\.(ts|tsx)$/.test(rel) ? [rel] : [];
  return readdirSync(abs).flatMap((f) => files(path.join(rel, f)));
}

export async function brand(r: Results) {
  r.section("brand: one source of truth");
  const literal = new RegExp(
    [BRAND.name, BRAND.domain.replace(".", "\\."), `${BRAND.cookies.session.split("_")[0]}_(?:session|demo)`].join("|"),
  );
  const hits: string[] = [];
  for (const f of SCAN.flatMap(files)) {
    if (ALLOW.has(f)) continue;
    readFileSync(path.join(ROOT, f), "utf8").split("\n").forEach((line, i) => {
      if (literal.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  r.check("no brand literals outside lib/brand.ts", hits.length === 0, hits.join("\n"));
  r.check("cookie names come from the brand", SESSION_COOKIE === BRAND.cookies.session && DEMO_COOKIE === BRAND.cookies.demo);
  r.check("mail addresses sit on the mail subdomain", BRAND.loginFrom.endsWith(`@${BRAND.mailDomain}`) && BRAND.notifyFrom.endsWith(`@${BRAND.mailDomain}`));
}

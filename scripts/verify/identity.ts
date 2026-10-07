// Phase 2 (identity): migration 0002, login-code caps, sessions and the proxy, membership
// resolution, createHousehold(), and sendMail's console mode. Library-level, so it needs no
// running server.

import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { withHousehold, withUser } from "@/lib/db";
import { safeNext } from "@/lib/flash";
import { createHousehold, findMembership, slugify } from "@/lib/households";
import { createLoginCode, hashIp, normalizeEmail, verifyLoginCode } from "@/lib/login-codes";
import { createDemoToken, createSessionToken, readDemoToken, readSessionToken } from "@/lib/session";
import { LOG_MARK, RUN, type Results, type Sql, email, makeHousehold, rolledBack } from "./harness";

export async function identity(r: Results, { owner, app }: { owner: Sql; app: Sql }) {
  const a = await makeHousehold(owner, "ia");
  const b = await makeHousehold(owner, "ib");

  r.section("identity: 0002 calendar tokens");
  const [fn] = await owner<{ secdef: boolean; cfg: string; acl: string }[]>`
    SELECT prosecdef AS secdef, proconfig::text AS cfg, proacl::text AS acl FROM pg_proc WHERE proname = 'calendar_context'`;
  r.check("calendar_context is SECURITY DEFINER", fn.secdef);
  r.check("calendar_context pins search_path", /search_path=public, pg_temp/.test(fn.cfg), fn.cfg);
  r.check("calendar_context not executable by PUBLIC", !/(^|[{,])=X/.test(fn.acl), fn.acl);
  r.check("calendar_context executable by lejer_app", /lejer_app=X/.test(fn.acl), fn.acl);
  const toks = await owner<{ id: number; hid: number; token: string }[]>`
    SELECT id, household_id AS hid, calendar_token AS token FROM memberships WHERE household_id IN (${a.id}, ${b.id}) ORDER BY id`;
  r.check("new memberships get 43-char base64url tokens", toks.every((t) => /^[A-Za-z0-9_-]{43}$/.test(t.token)));
  r.check("tokens are distinct", new Set(toks.map((t) => t.token)).size === toks.length);
  const mine = toks.find((t) => t.id === a.member.membershipId)!;
  const theirs = toks.find((t) => t.id === b.member.membershipId)!;
  const resolved = await withUser(null, (tx) => tx<{ household_id: number; membership_id: number }[]>`SELECT * FROM calendar_context(${mine.token})`);
  r.check("token resolves with no household set", resolved.length === 1 && resolved[0].household_id === a.id && resolved[0].membership_id === mine.id, resolved);
  r.check("…and returns only (household_id, membership_id)", Object.keys(resolved[0] ?? {}).join() === "household_id,membership_id");
  r.check("unknown token → nothing", (await withUser(null, (tx) => tx`SELECT * FROM calendar_context('nope')`)).length === 0);
  const scope = { household: { id: a.id }, user: { id: a.member.userId } };
  const rotated = await withHousehold(scope, (tx) => tx<{ token: string }[]>`
    UPDATE memberships SET calendar_token = DEFAULT WHERE id = ${mine.id} RETURNING calendar_token AS token`);
  r.check("reset (SET calendar_token = DEFAULT) rotates the token", rotated.length === 1 && rotated[0].token !== mine.token);
  r.check("old token stops resolving", (await withUser(null, (tx) => tx`SELECT * FROM calendar_context(${mine.token})`)).length === 0);
  const cross = await withHousehold(scope, (tx) => tx`UPDATE memberships SET calendar_token = DEFAULT WHERE id = ${theirs.id}`);
  r.check("reset can't reach another household's membership", cross.count === 0);
  await rolledBack(owner, async (tx) => {
    await tx`DELETE FROM memberships WHERE id = ${b.member.membershipId}`;
    const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM calendar_context(${theirs.token})`;
    r.check("removing a membership kills its feed token", n === 0);
  });

  r.section("identity: 0002 schema");
  const [def] = await owner<{ d: string }[]>`
    SELECT column_default AS d FROM information_schema.columns WHERE table_name = 'households' AND column_name = 'ask_bill_date'`;
  r.check("ask_bill_date defaults false", def.d === "false", def.d);
  const cols = await owner<{ c: string; t: string; nullable: string }[]>`
    SELECT column_name AS c, udt_name AS t, is_nullable AS nullable FROM information_schema.columns WHERE table_name = 'login_codes'`;
  r.check("login_codes has no user_id", !cols.some((c) => c.c === "user_id"));
  r.check("login_codes.email is citext NOT NULL", cols.some((c) => c.c === "email" && c.t === "citext" && c.nullable === "NO"));

  r.section("identity: email normalization and redirects");
  r.check("normalizeEmail trims and lowercases", normalizeEmail("  Jo.Smith@Example.COM ") === "jo.smith@example.com");
  r.check("normalizeEmail rejects junk", normalizeEmail("nope") === null && normalizeEmail("a b@c.d") === null && normalizeEmail(`${"x".repeat(250)}@a.co`) === null);
  r.check("hashIp keys on the first x-forwarded-for hop", hashIp("203.0.113.9, 10.0.0.1") === hashIp("203.0.113.9") && hashIp(null) === null);
  for (const [input, out] of [["/portal?x=1", "/portal?x=1"], ["//evil.example", "/"], ["/\\evil.example", "/"], ["https://evil.example", "/"], ["portal", "/"], [undefined, "/"]] as const) {
    r.check(`safeNext(${JSON.stringify(input)}) → ${out}`, safeNext(input) === out, safeNext(input));
  }

  r.section("identity: login codes");
  const codeOf = async (e: string, ip: string | null = null) => withUser(null, (tx) => createLoginCode(tx, e, ip));
  const e1 = email("codes");
  const first = await codeOf(e1);
  r.check("a code for an unknown email is created", first.kind === "created");
  const [{ n: usersFor }] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM users WHERE email = ${e1}`;
  r.check("requesting a code creates no users row", usersFor === 0);
  r.check("second request within 30 s → recent (burst dedupe)", (await codeOf(e1.toUpperCase().toLowerCase())).kind === "recent");
  await owner`UPDATE login_codes SET created_at = now() - interval '2 minutes' WHERE email = ${e1}`;
  for (let i = 0; i < 4; i++) await owner`INSERT INTO login_codes (email, code_hash, created_at, expires_at) VALUES (${e1}, ${"0".repeat(64)}, now() - interval '2 minutes', now() + interval '8 minutes')`;
  r.check("6th code for one email in 10 min → rate-limited", (await codeOf(e1)).kind === "rate-limited");
  await owner`UPDATE login_codes SET created_at = now() - interval '11 minutes' WHERE email = ${e1}`;
  r.check("the 10-minute window slides", (await codeOf(e1)).kind === "created");

  const ip = hashIp(`198.51.100.${RUN.length}-${RUN}`);
  for (let i = 0; i < 10; i++) await owner`INSERT INTO login_codes (email, code_hash, ip_hash, created_at, expires_at) VALUES (${email(`ip${i}`)}, ${"0".repeat(64)}, ${ip}, now() - interval '20 minutes', now() - interval '10 minutes')`;
  r.check("11th code from one IP in an hour → rate-limited", (await codeOf(email("ip-new"), ip)).kind === "rate-limited");
  r.check("…while another IP is unaffected", (await codeOf(email("ip-new"), hashIp(`192.0.2.1-${RUN}`))).kind === "created");

  // The global cap counts every login_code email today, so add 40 marked rows, then remove them.
  await owner`INSERT INTO email_log (household_id, kind, to_hash, ok) SELECT NULL, 'login_code', ${LOG_MARK}, true FROM generate_series(1, 40)`;
  try {
    r.check("41st login-code email of the UTC day → daily-cap", (await codeOf(email("daily"))).kind === "daily-cap");
  } finally {
    await owner`DELETE FROM email_log WHERE kind = 'login_code' AND to_hash = ${LOG_MARK}`;
  }

  const e2 = email("guess");
  const made = await codeOf(e2);
  if (made.kind !== "created") throw new Error("setup: no code");
  const wrong = made.code === "000000" ? "111111" : "000000";
  const outcomes: string[] = [];
  for (let i = 0; i < 5; i++) outcomes.push(await withUser(null, (tx) => verifyLoginCode(tx, e2, wrong)));
  outcomes.push(await withUser(null, (tx) => verifyLoginCode(tx, e2, made.code)));
  r.check("5 wrong guesses kill the code", outcomes.join() === "bad,bad,bad,bad,bad,expired", outcomes.join());
  const e3 = email("right");
  const ok = await codeOf(e3);
  if (ok.kind !== "created") throw new Error("setup: no code");
  r.check("the right code verifies once", (await withUser(null, (tx) => verifyLoginCode(tx, e3, ok.code))) === "ok");
  r.check("…and is then gone", (await withUser(null, (tx) => verifyLoginCode(tx, e3, ok.code))) === "expired");

  r.section("identity: sessions and the proxy");
  const tok = await createSessionToken(a.admin.userId, a.id);
  const read = await readSessionToken(tok);
  r.check("session token round-trips {uid, hid}", read?.uid === a.admin.userId && read?.hid === a.id);
  r.check("hid may be null (signed in, no household yet)", (await readSessionToken(await createSessionToken(1, null)))?.hid === null);
  const demo = await createDemoToken();
  r.check("a demo token is not a session", (await readSessionToken(demo)) === null);
  r.check("a session token is not a demo token", (await readDemoToken(tok)) === false);
  r.check("demo token verifies as demo", await readDemoToken(demo));
  const key = new TextEncoder().encode(process.env.SESSION_SECRET!);
  const forged = await new SignJWT({ uid: 1, hid: null }).setProtectedHeader({ alg: "HS256" }).setAudience("session").setIssuedAt().setExpirationTime("1d").sign(new TextEncoder().encode("wrong"));
  r.check("a token signed with another key is rejected", (await readSessionToken(forged)) === null);
  const badShape = await new SignJWT({ uid: "1", hid: null }).setProtectedHeader({ alg: "HS256" }).setAudience("session").setIssuedAt().setExpirationTime("1d").sign(key);
  r.check("a token with a non-integer uid is rejected", (await readSessionToken(badShape)) === null);

  const devUser = process.env.APP_DEV_USER;
  delete process.env.APP_DEV_USER; // the proxy short-circuits under the dev bypass
  try {
    const call = (path: string, init: { method?: string; cookie?: string } = {}) =>
      proxy(new NextRequest(`http://localhost${path}`, { method: init.method ?? "GET", headers: init.cookie ? { cookie: init.cookie } : {} }));
    let res = await call("/portal/household?x=1");
    r.check("proxy: no cookie, GET → /login?next=", res.status === 307 && res.headers.get("location")?.endsWith("/login?next=%2Fportal%2Fhousehold%3Fx%3D1") === true, res.headers.get("location"));
    res = await call("/account", { method: "POST" });
    r.check("proxy: no cookie, POST → 401", res.status === 401);
    for (const p of ["/login", "/demo", "/demo/signed-in", "/cal.ics", "/api/cron/tick", "/api/documents/upload", "/no-access"]) {
      res = await call(p);
      r.check(`proxy: ${p} is public`, res.headers.get("x-middleware-next") === "1", res.status);
    }
    res = await call("/loginx");
    r.check("proxy: /loginx is not public (exact segment match)", res.status === 307);
    res = await call("/", { cookie: `lejer_session=${tok}` });
    r.check("proxy: fresh session passes without re-issuing", res.headers.get("x-middleware-next") === "1" && !res.headers.get("set-cookie"));
    const old = await new SignJWT({ uid: a.admin.userId, hid: a.id }).setProtectedHeader({ alg: "HS256" }).setAudience("session")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 8 * 86400).setExpirationTime("30d").sign(key);
    res = await call("/", { cookie: `lejer_session=${old}` });
    const renewed = res.headers.get("set-cookie") ?? "";
    r.check("proxy: an 8-day-old session is re-issued", renewed.startsWith("lejer_session=") && !renewed.includes(old));
    const reissued = await readSessionToken(renewed.split(";")[0].split("=")[1]);
    r.check("…keeping uid and hid", reissued?.uid === a.admin.userId && reissued?.hid === a.id);
    res = await call("/", { cookie: `lejer_demo=${demo}` });
    r.check("proxy: demo cookie passes", res.headers.get("x-middleware-next") === "1");
    res = await call("/", { cookie: `lejer_session=${demo}` });
    r.check("proxy: demo token in the session cookie is refused", res.status === 307);
  } finally {
    if (devUser !== undefined) process.env.APP_DEV_USER = devUser;
  }

  r.section("identity: membership resolution");
  const [both] = await owner<{ id: number }[]>`INSERT INTO users (email, name) VALUES (${email("resolve")}, 'Resolve') RETURNING id`;
  await owner`INSERT INTO memberships (household_id, user_id, role, joined_at) VALUES (${b.id}, ${both.id}, 'member', NULL), (${a.id}, ${both.id}, 'member', now())`;
  const pick = (hid: number | null) => withUser(both.id, (tx) => findMembership(tx, both.id, hid));
  r.check("valid hid is honored", (await pick(b.id))?.household.id === b.id);
  r.check("stale hid falls back to a joined household before a pending one", (await pick(999999))?.household.id === a.id);
  r.check("null hid → first joined household", (await pick(null))?.household.id === a.id);
  r.check("no memberships → null", (await withUser(a.admin.userId, (tx) => findMembership(tx, 424242, null))) === null);

  r.section("identity: createHousehold");
  const [founder] = await owner<{ id: number }[]>`INSERT INTO users (email, name) VALUES (${email("founder")}, 'Founder') RETURNING id`;
  const name = `Verify ${RUN} House #1`;
  const h1 = await createHousehold({ userId: founder.id, email: email("founder"), name, mode: "single_payer", theme: "statement", timezone: "America/Chicago" });
  const h2 = await createHousehold({ userId: founder.id, email: email("founder"), name, mode: "ledger", theme: "peach", timezone: "UTC" });
  r.check("slug from the name", h1.slug === slugify(name) && h1.slug === `verify-${RUN}-house-1`, h1.slug);
  r.check("slug collision gets a suffix", h2.slug === `${h1.slug}-2`, h2.slug);
  const made2 = await owner<{ slug: string; askBillDate: boolean; colorScheme: string; replyTo: string; role: string; joined: boolean }[]>`
    SELECT h.slug, h.ask_bill_date AS "askBillDate", h.color_scheme AS "colorScheme", h.reply_to AS "replyTo",
           m.role, m.joined_at IS NOT NULL AS joined
    FROM households h JOIN memberships m ON m.household_id = h.id WHERE h.id IN (${h1.id}, ${h2.id}) ORDER BY h.id`;
  r.check("single_payer → ask_bill_date on; ledger → off", made2[0].askBillDate === true && made2[1].askBillDate === false);
  r.check("peach is light-only; statement follows the system", made2[0].colorScheme === "system" && made2[1].colorScheme === "light");
  r.check("creator is a joined admin and the reply-to", made2.every((m) => m.role === "admin" && m.joined && m.replyTo === email("founder")));

  r.section("identity: mail console mode");
  const { consoleMode, sendMail } = await import("@/lib/mail");
  const savedKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "";
  try {
    r.check("empty key outside production → console mode", consoleMode());
    process.env.VERCEL_ENV = "production";
    r.check("…never in production", !consoleMode());
    delete process.env.VERCEL_ENV;
    const before = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM email_log`;
    const { createElement } = await import("react");
    const { default: LoginCode } = await import("@/emails/LoginCode");
    const log = console.log;
    let printed = "";
    console.log = (...args: unknown[]) => { printed += args.join(" "); };
    let sent: boolean;
    try {
      sent = await sendMail({ to: email("console"), subject: "123456 is your Lejer sign-in code", react: createElement(LoginCode, { code: "123456" }), kind: "login_code" });
    } finally {
      console.log = log;
    }
    const after = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM email_log`;
    r.check("console mode prints with [mail:console] and the code", sent && printed.startsWith("[mail:console] login_code to ") && printed.includes("123456"));
    r.check("console mode writes no email_log row", after[0].n === before[0].n);
  } finally {
    process.env.RESEND_API_KEY = savedKey;
  }
}

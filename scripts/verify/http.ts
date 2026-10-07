// End to end over HTTP against `next start` on the build from gate 1 (`npm run build`), with
// mail forced into console mode so nothing is ever sent. Sessions are minted directly with
// SESSION_SECRET for fixture users (the login flow itself is driven once, through console mail).
// Real blobs are written under fixture households' h/{id}/ prefixes; the harness sweep deletes
// them by prefix, before the rows, on every run.

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { billPdfKey, putBillPdf } from "@/lib/blob";
import { DEMO_COOKIE, SESSION_COOKIE, createDemoToken, createSessionToken } from "@/lib/session";
import { RUN, type Results, type Sql, addMember, email, makeHousehold } from "./harness";

const ROOT = path.join(import.meta.dirname, "..", "..");
const PDF = new TextEncoder().encode(`%PDF-1.4\n% verify ${RUN}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

class Server {
  private proc!: ChildProcess;
  log = "";
  constructor(readonly port: number) {}
  get base() {
    return `http://127.0.0.1:${this.port}`;
  }
  async start() {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(this.port), RESEND_API_KEY: "", APP_DEV_USER: "", APP_DEV_HOUSEHOLD: "", NODE_ENV: "production" };
    delete env.VERCEL_ENV;
    this.proc = spawn(path.join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(this.port), "-H", "127.0.0.1"], { cwd: ROOT, env });
    this.proc.stdout!.on("data", (c) => (this.log += c));
    this.proc.stderr!.on("data", (c) => (this.log += c));
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${this.base}/login`)).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`next start did not come up:\n${this.log}`);
  }
  stop() {
    this.proc?.kill("SIGTERM");
  }
}

/** Newest mtime under the directories the build compiles. */
function newestSource(): number {
  const walk = (p: string): number => {
    const st = statSync(p);
    if (!st.isDirectory()) return /\.(tsx?|css)$/.test(p) ? st.mtimeMs : 0;
    return Math.max(0, ...readdirSync(p).map((f) => walk(path.join(p, f))));
  };
  return Math.max(...["app", "lib", "emails", "proxy.ts", "instrumentation.ts", "next.config.ts"].map((d) => walk(path.join(ROOT, d))));
}

function actionIds(): Map<string, string> {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, ".next/server/server-reference-manifest.json"), "utf8"));
  const ids = new Map<string, string>();
  for (const [id, v] of Object.entries<{ exportedName?: string; filename?: string }>(manifest.node)) {
    if (v.exportedName) ids.set(`${v.filename}#${v.exportedName}`, id);
  }
  return ids;
}

export async function http(r: Results, { owner }: { owner: Sql }) {
  r.section("http: build and server");
  const buildId = path.join(ROOT, ".next/BUILD_ID");
  if (!existsSync(buildId)) throw new Error("no production build: run `npm run build` (gate 1) first");
  const stale = newestSource() > statSync(buildId).mtimeMs;
  r.check("the production build is newer than every source file", !stale, "run `npm run build` (gate 1) first");
  if (stale) return;
  const ids = actionIds();
  const id = (file: string, name: string) => {
    const v = ids.get(`${file}#${name}`);
    if (!v) throw new Error(`action ${file}#${name} not in the build; rebuild`);
    return v;
  };

  const server = new Server(4100 + Math.floor(Math.random() * 800));
  await server.start();
  try {
    await suite(r, owner, server, id);
  } finally {
    server.stop();
  }
}

async function suite(r: Results, owner: Sql, server: Server, id: (file: string, name: string) => string) {
  const base = server.base;
  const cookieFor = async (uid: number, hid: number | null) => `${SESSION_COOKIE}=${await createSessionToken(uid, hid)}`;
  const get = (p: string, cookie?: string) => fetch(base + p, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  /** A no-JS form post to a plain `action={fn}` form. */
  const formPost = (page: string, actionId: string, fields: Record<string, string>, cookie: string) => {
    const fd = new FormData();
    fd.set(`$ACTION_ID_${actionId}`, "");
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fetch(base + page, { method: "POST", body: fd, headers: { cookie, origin: base }, redirect: "manual" });
  };
  /** The client's own action call (encodeReply): JSON args, or [state, FormData] as _1_ fields. */
  const callAction = (page: string, actionId: string, args: unknown[] | { state: unknown; form: FormData }, cookie: string) => {
    let body: string | FormData;
    if (Array.isArray(args)) body = JSON.stringify(args);
    else {
      // Same order as React's encodeReply: the referenced fields first, the root "0" last (the
      // server decodes as the stream arrives, so a root that comes first sees an empty form).
      body = new FormData();
      for (const [k, v] of args.form.entries()) body.append(`_1_${k}`, v);
      body.set("0", JSON.stringify([args.state, "$K1"]));
    }
    return fetch(base + page, { method: "POST", body, headers: { cookie, origin: base, "next-action": actionId, accept: "text/x-component" }, redirect: "manual" });
  };
  const err = (res: Response) => new URL(res.headers.get("location") ?? "/", base).searchParams.get("err") ?? "";

  // Fixtures: two ledger households with documents on.
  const a = await makeHousehold(owner, "ha", "ledger");
  const b = await makeHousehold(owner, "hb", "ledger");
  await owner`UPDATE households SET feature_documents = true WHERE id IN (${a.id}, ${b.id})`;
  const aAdmin = await cookieFor(a.admin.userId, a.id);
  const aMember = await cookieFor(a.member.userId, a.id);
  const bAdmin = await cookieFor(b.admin.userId, b.id);

  r.section("http: /files");
  const keyA = billPdfKey(a.id, "Gas", "2030-01-01", a.billId);
  const keyB = billPdfKey(b.id, "Gas", "2030-01-01", b.billId);
  await putBillPdf(keyA, new Blob([PDF]));
  await putBillPdf(keyB, new Blob([PDF]));
  await owner`UPDATE bills SET pdf_path = ${keyA} WHERE id = ${a.billId}`;
  await owner`UPDATE bills SET pdf_path = ${keyB} WHERE id = ${b.billId}`;
  let res = await get(`/files/${keyA}`, aAdmin);
  const bytes = new Uint8Array(await res.arrayBuffer());
  r.check("own household's PDF streams (200, application/pdf)", res.status === 200 && res.headers.get("content-type") === "application/pdf", res.status);
  r.check("…byte for byte, with nosniff and private caching",
    bytes.length === PDF.length && bytes.every((x, i) => x === PDF[i]) && res.headers.get("x-content-type-options") === "nosniff" && /private/.test(res.headers.get("cache-control") ?? ""));
  res = await get(`/files/${keyA}`, aMember);
  r.check("a member of the household can read it too", res.status === 200);
  res = await get(`/files/${keyB}`, aAdmin);
  r.check("valid session, another household's key → refused", res.status === 404, res.status);
  res = await get(`/files/${keyB}`, bAdmin);
  r.check("…while B's own admin gets it (control)", res.status === 200, res.status);
  res = await get(`/files/${keyA}`, bAdmin);
  r.check("…and B can't read A's", res.status === 404, res.status);
  res = await get(`/files/h/${a.id}/bills/2030/gas/0101-999999.pdf`, aAdmin);
  r.check("own prefix, not recorded → 404", res.status === 404, res.status);
  res = await get(`/files/h/${a.id}/..%2F${b.id}/bills/2030/gas/0101-${b.billId}.pdf`, aAdmin);
  r.check("encoded ../ toward another household → refused", res.status === 404 || res.status === 400, res.status);
  res = await get(`/files/h/${a.id}/documents/evil.svg`, aAdmin);
  r.check("SVG → 404", res.status === 404, res.status);
  res = await get(`/files/${keyA}`);
  r.check("no session → sent to /login", res.status === 307 && (res.headers.get("location") ?? "").includes("/login"), res.status);
  res = await get(`/files/${keyA}`, `${DEMO_COOKIE}=${await createDemoToken()}`);
  r.check("demo session → 404", res.status === 404, res.status);

  r.section("http: posting bills over the wire (useActionState protocol)");
  const addBill = id("app/portal/actions.ts", "addBill");
  const billForm = (typeId: number, amount: string, withPdf: Uint8Array | string | null) => {
    const f = new FormData();
    f.set("typeId", String(typeId));
    f.set("amount", amount);
    f.set("dueDate", "2030-02-01");
    if (withPdf) f.set("pdf", new Blob([withPdf as BlobPart], { type: "application/pdf" }), "ViewExternalBill.pdf");
    return f;
  };
  const count = async (hid: number) => (await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM bills WHERE household_id = ${hid}`)[0].n;
  let before = await count(a.id);
  res = await callAction("/portal", addBill, { state: { errors: [] }, form: billForm(a.typeId, "50.00", null) }, aMember);
  let text = await res.text();
  r.check("ledger member posting for someone else's type → refused with the reason", text.includes("You can only post bills and mark payments for bill types you own"), text.slice(0, 200));
  r.check("…and no bill was created", (await count(a.id)) === before);
  res = await callAction("/portal", addBill, { state: { errors: [] }, form: billForm(a.memberTypeId, "50.00", PDF) }, aMember);
  await res.text();
  const [posted] = await owner<{ id: number; pdf: string | null; per: string; addedBy: number }[]>`
    SELECT id, pdf_path AS pdf, per_person_cost AS per, added_by_id AS "addedBy" FROM bills
    WHERE household_id = ${a.id} AND type_id = ${a.memberTypeId} ORDER BY id DESC LIMIT 1`;
  r.check("member posts for their own type (redirect back to /portal?ok=)", (res.headers.get("x-action-redirect") ?? "").startsWith("/portal?ok="), res.headers.get("x-action-redirect"));
  r.check("…stored with the poster and a 25.00 share", posted && posted.addedBy === a.member.membershipId && Number(posted.per) === 25, posted);
  r.check("…its PDF under h/{id}/bills/{year}/water/{MMDD}-{billId}.pdf", !!posted?.pdf && new RegExp(`^h/${a.id}/bills/\\d{4}/water/\\d{4}-${posted.id}\\.pdf$`).test(posted.pdf), posted?.pdf);
  res = await get(`/files/${posted.pdf}`, aAdmin);
  r.check("…and the uploaded PDF is served back", res.status === 200 && (await res.arrayBuffer()).byteLength === PDF.length);
  before = await count(a.id);
  res = await callAction("/portal", addBill, { state: { errors: [] }, form: billForm(a.memberTypeId, "50.00", "not a pdf at all") }, aMember);
  text = await res.text();
  r.check("a non-PDF upload is refused", text.includes("isn't a PDF") && (await count(a.id)) === before);
  res = await callAction("/portal", addBill, { state: { errors: [] }, form: billForm(a.memberTypeId, "12.345", null) }, aMember);
  r.check("a malformed amount is refused", (await res.text()).includes("Enter the amount"));
  r.check("new-bill mail went to the console, never to Resend", /\[mail:console\] new_bill to /.test(server.log) && !/sendMail\(new_bill\) failed/.test(server.log));

  r.section("http: marking payments over the wire");
  const setPaidAction = id("app/portal/actions.ts", "setPaidAction");
  res = await callAction("/portal", setPaidAction, [a.billId, a.member.membershipId, true], aMember);
  text = await res.text();
  r.check("member marking a payment on someone else's type → refused", text.includes("types you own") && text.includes('"ok":false'), text.slice(0, 160));
  const [{ paid: stillUnpaid }] = await owner<{ paid: boolean }[]>`SELECT paid_at IS NOT NULL AS paid FROM bill_debts WHERE bill_id = ${a.billId}`;
  r.check("…and the row is untouched", stillUnpaid === false);
  res = await callAction("/portal", setPaidAction, [a.billId, a.member.membershipId, true], aAdmin);
  text = await res.text();
  r.check("admin marks it paid → bill status paid", text.includes('"ok":true') && text.includes('"status":"paid"'), text.slice(0, 160));
  res = await callAction("/portal", setPaidAction, [b.billId, b.member.membershipId, true], aAdmin);
  text = await res.text();
  r.check("an admin of A can't touch B's bill (RLS hides it)", text.includes('"ok":false') && text.includes("no longer exists"), text.slice(0, 160));

  r.section("http: other portal actions");
  res = await formPost("/portal", id("app/portal/actions.ts", "sendReminder"), { billId: String(b.billId) }, aAdmin);
  r.check("reminder for another household's bill → refused", err(res).includes("no longer exists"), err(res));
  res = await formPost("/portal/household", id("app/portal/actions.ts", "saveBillTypeAction"), { name: "Nope", emoji: "❌", processingFee: "0" }, aMember);
  r.check("member adding a bill type → refused", res.status >= 400 || err(res) !== "", res.status);
  res = await formPost("/portal/household", id("app/portal/actions.ts", "removeBillTypeAction"), { typeId: String(a.typeId) }, aAdmin);
  r.check("removing a type with bills → friendly refusal", err(res).includes("on record"), err(res));
  const roomie = await addMember(owner, a, `ha-roomie-${RUN}`);
  const lateBill = await owner<{ id: number }[]>`SELECT id FROM bills WHERE id = ${posted.id}`;
  res = await callAction("/portal", setPaidAction, [lateBill[0].id, roomie.membershipId, true], aAdmin);
  r.check("someone who joined after a bill can't be marked on it", (await res.text()).includes("doesn't owe"));

  r.section("http: document upload tokens");
  const tokenReq = (pathname: string, cookie?: string) =>
    fetch(`${base}/api/documents/upload`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname, clientPayload: null, multipart: false } }),
    });
  res = await tokenReq(`h/${a.id}/documents/lease.pdf`);
  r.check("anonymous → 401", res.status === 401, res.status);
  res = await tokenReq(`h/${a.id}/documents/lease.pdf`, aMember);
  r.check("member → 401", res.status === 401, res.status);
  res = await tokenReq(`h/${b.id}/documents/lease.pdf`, aAdmin);
  r.check("admin asking for another household's prefix → 400", res.status === 400, res.status);
  res = await tokenReq(`h/${a.id}/bills/2030/gas/0101-1.pdf`, aAdmin);
  r.check("admin asking for a bill key → 400", res.status === 400, res.status);
  res = await tokenReq(`h/${a.id}/documents/lease.pdf`, aAdmin);
  const tok = (await res.json()) as { clientToken?: string };
  r.check("admin, own documents prefix → client token", res.status === 200 && typeof tok.clientToken === "string", res.status);

  r.section("http: pages");
  const page = async (p: string, cookie: string) => {
    const x = await get(p, cookie);
    return { status: x.status, html: (await x.text()).replaceAll("<!-- -->", "") };
  };
  let pg = await page("/", aMember);
  r.check("dashboard renders for a member with their balance", pg.status === 200 && pg.html.includes("You owe") && pg.html.includes("The house ledger"), pg.status);
  pg = await page("/portal", aMember);
  r.check("portal renders for a member (read-only checkboxes on others' bills)", pg.status === 200 && pg.html.includes("Paid back") && pg.html.includes("disabled"), pg.status);
  pg = await page("/portal/household", aAdmin);
  r.check("household tab shows bill types with owners (ledger)", pg.status === 200 && pg.html.includes("Bill types") && pg.html.includes("Owner (pays the provider)"));
  pg = await page("/documents", aAdmin);
  r.check("documents page renders when the feature is on", pg.status === 200 && pg.html.includes("Documents"));
  await owner`UPDATE households SET feature_documents = false WHERE id = ${a.id}`;
  pg = await page("/documents", aAdmin);
  // Under the root loading.tsx the page streams, so notFound() can't change the already-sent
  // 200; what matters is that the not-found UI renders instead of the documents.
  r.check("…and renders not-found when it's off", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("The lease, insurance"), pg.status);
  pg = await page("/", `${DEMO_COOKIE}=${await createDemoToken()}`);
  r.check("demo dashboard renders from memory", pg.status === 200 && pg.html.includes("Demo House") && pg.html.includes("The house ledger"));

  r.section("http: sign-in flow (console mail)");
  const fresh = email("signup");
  const loginForm = (actionName: string, fields: Record<string, string>) => formPost("/login", id("app/login/actions.ts", actionName), fields, "");
  res = await loginForm("requestCode", { email: fresh.toUpperCase(), next: "/" });
  r.check("code requested (unknown email welcome)", (res.headers.get("location") ?? "").includes("step=code"), res.headers.get("location"));
  let code = "";
  for (let i = 0; i < 25 && !code; i++) {
    code = new RegExp(`\\[mail:console\\] login_code to ${fresh.replace(/[.]/g, "\\.")}: (\\d{6})`).exec(server.log)?.[1] ?? "";
    if (!code) await new Promise((x) => setTimeout(x, 200));
  }
  r.check("the code was printed, not sent", code.length === 6);
  res = await loginForm("submitCode", { email: fresh, code, next: "/" });
  const setCookie = res.headers.get("set-cookie") ?? "";
  r.check("verified → session cookie and onboarding", setCookie.startsWith(`${SESSION_COOKIE}=`) && (res.headers.get("location") ?? "").endsWith("/welcome/household"));
  const [{ n: created }] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM users WHERE email = ${fresh}`;
  r.check("the users row exists only after verifying", created === 1);
}

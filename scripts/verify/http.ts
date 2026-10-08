// End to end over HTTP against `next start` on the build from gate 1 (`npm run build`), with
// mail forced into console mode so nothing is ever sent. Sessions are minted directly with
// SESSION_SECRET for fixture users (the login flow itself is driven once, through console mail).
// Real blobs are written under fixture households' h/{id}/ prefixes; the harness sweep deletes
// them by prefix, before the rows, on every run.

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { billPdfKey, blobExists, putBillPdf } from "@/lib/blob";
import { householdPath } from "@/lib/paths";
import { HOUSEHOLD_COOKIE, SESSION_COOKIE, createSessionToken } from "@/lib/session";
import { RUN, type Results, type Sql, addMember, email, makeHousehold } from "./harness";

const ROOT = path.join(import.meta.dirname, "..", "..");
const PDF = new TextEncoder().encode(`%PDF-1.4\n% verify ${RUN}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

// The server runs on a fixed port in its own process group, recorded in a pidfile. A verify run
// that dies without cleaning up (SIGKILL, a crash) leaves it running; the next run kills that
// group and frees the port before starting its own. Only processes that are ours are killed:
// the recorded group, or a `next` process still listening on the port.
const PIDFILE = path.join(ROOT, ".verify", "server.json");
const PORT = Number(process.env.VERIFY_PORT ?? 4317);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function listeners(port: number): number[] {
  try {
    return execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number);
  } catch {
    return []; // lsof exits 1 when nothing listens
  }
}

const commandOf = (pid: number) => {
  try {
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

async function killGroup(pid: number): Promise<void> {
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    try {
      process.kill(-pid, signal); // the whole group: next and its server child
    } catch {}
    for (let i = 0; i < 25 && alive(pid); i++) await sleep(100);
    if (!alive(pid)) return;
  }
}

/** Kills a server a previous run left behind and makes sure the port is free. */
async function clearStaleServer(port: number): Promise<string | null> {
  let note: string | null = null;
  if (existsSync(PIDFILE)) {
    const stale = JSON.parse(readFileSync(PIDFILE, "utf8")) as { pid: number; port: number };
    if (alive(stale.pid)) {
      await killGroup(stale.pid);
      note = `killed stale verify server (pid ${stale.pid}, port ${stale.port})`;
    }
    rmSync(PIDFILE, { force: true });
  }
  for (const pid of listeners(port)) {
    const cmd = commandOf(pid);
    if (!/\bnext\b|next-server/.test(cmd)) throw new Error(`port ${port} is taken by something that isn't ours (pid ${pid}: ${cmd}); set VERIFY_PORT`);
    await killGroup(pid);
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
    note = `${note ? `${note}; ` : ""}freed port ${port} from pid ${pid}`;
  }
  for (let i = 0; i < 25 && listeners(port).length; i++) await sleep(100);
  if (listeners(port).length) throw new Error(`port ${port} is still in use`);
  return note;
}

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
    this.proc = spawn(path.join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(this.port), "-H", "127.0.0.1"], { cwd: ROOT, env, detached: true });
    mkdirSync(path.dirname(PIDFILE), { recursive: true });
    writeFileSync(PIDFILE, JSON.stringify({ pid: this.proc.pid, port: this.port, startedAt: new Date().toISOString() }));
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
  async stop() {
    if (this.proc?.pid) await killGroup(this.proc.pid);
    rmSync(PIDFILE, { force: true });
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

  const cleared = await clearStaleServer(PORT);
  if (cleared) console.log(`(${cleared})`);
  const server = new Server(PORT);
  await server.start();
  try {
    await suite(r, owner, server, id);
  } finally {
    await server.stop();
  }
}

async function suite(r: Results, owner: Sql, server: Server, id: (file: string, name: string) => string) {
  const base = server.base;
  const cookieFor = async (uid: number) => `${SESSION_COOKIE}=${await createSessionToken(uid)}`;
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
  const ok = (res: Response) => new URL(res.headers.get("location") ?? "/", base).searchParams.get("ok") ?? "";

  // Fixtures: two ledger households with documents on.
  const a = await makeHousehold(owner, "ha", "ledger");
  const b = await makeHousehold(owner, "hb", "ledger");
  await owner`UPDATE households SET feature_documents = true WHERE id IN (${a.id}, ${b.id})`;
  /** Paths inside each fixture household: its pages live under its slug (lib/paths.ts). */
  const A = (p = "") => householdPath(a, p);
  const B = (p = "") => householdPath(b, p);
  const aAdmin = await cookieFor(a.admin.userId);
  const aMember = await cookieFor(a.member.userId);
  const bAdmin = await cookieFor(b.admin.userId);

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
  res = await get(`/files/${keyA}`, bAdmin + `; ${HOUSEHOLD_COOKIE}=${a.slug}`);
  r.check("the last-household cookie grants nothing (B's admin, A's key) → 404", res.status === 404, res.status);

  r.section("http: posting bills over the wire (useActionState protocol)");
  const addBill = id("app/(household)/[household]/portal/actions.ts", "addBill");
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
  res = await callAction(A("/portal"), addBill, { state: { errors: [] }, form: billForm(a.typeId, "50.00", null) }, aMember);
  let text = await res.text();
  r.check("ledger member posting for someone else's type → refused with the reason", text.includes("You can only post bills and mark payments for bill types you own"), text.slice(0, 200));
  r.check("…and no bill was created", (await count(a.id)) === before);
  res = await callAction(A("/portal"), addBill, { state: { errors: [] }, form: billForm(a.memberTypeId, "50.00", PDF) }, aMember);
  await res.text();
  const [posted] = await owner<{ id: number; pdf: string | null; per: string; addedBy: number }[]>`
    SELECT id, pdf_path AS pdf, per_person_cost AS per, added_by_id AS "addedBy" FROM bills
    WHERE household_id = ${a.id} AND type_id = ${a.memberTypeId} ORDER BY id DESC LIMIT 1`;
  r.check("member posts for their own type (redirect back to /portal?ok=)", (res.headers.get("x-action-redirect") ?? "").startsWith(A("/portal?ok=")), res.headers.get("x-action-redirect"));
  r.check("…stored with the poster and a 25.00 share", posted && posted.addedBy === a.member.membershipId && Number(posted.per) === 25, posted);
  r.check("…its PDF under h/{id}/bills/{year}/water/{MMDD}-{billId}.pdf", !!posted?.pdf && new RegExp(`^h/${a.id}/bills/\\d{4}/water/\\d{4}-${posted.id}\\.pdf$`).test(posted.pdf), posted?.pdf);
  res = await get(`/files/${posted.pdf}`, aAdmin);
  r.check("…and the uploaded PDF is served back", res.status === 200 && (await res.arrayBuffer()).byteLength === PDF.length);
  before = await count(a.id);
  res = await callAction(A("/portal"), addBill, { state: { errors: [] }, form: billForm(a.memberTypeId, "50.00", "not a pdf at all") }, aMember);
  text = await res.text();
  r.check("a non-PDF upload is refused", text.includes("isn't a PDF") && (await count(a.id)) === before);
  res = await callAction(A("/portal"), addBill, { state: { errors: [] }, form: billForm(a.memberTypeId, "12.345", null) }, aMember);
  r.check("a malformed amount is refused", (await res.text()).includes("Enter the amount"));
  const [queued] = await owner<{ kind: string | null; queued: boolean }[]>`
    SELECT notice_kind AS kind, notice_queued_at IS NOT NULL AS queued FROM bills WHERE id = ${posted.id}`;
  r.check("posting queues the new-bill email instead of sending it", queued?.kind === "new" && queued.queued && !/new_bill to /.test(server.log), queued);

  r.section("http: marking payments over the wire");
  const setPaidAction = id("app/(household)/[household]/portal/actions.ts", "setPaidAction");
  res = await callAction(A("/portal"), setPaidAction, [a.billId, a.member.membershipId, true], aMember);
  text = await res.text();
  r.check("member marking a payment on someone else's type → refused", text.includes("types you own") && text.includes('"ok":false'), text.slice(0, 160));
  const [{ paid: stillUnpaid }] = await owner<{ paid: boolean }[]>`SELECT paid_at IS NOT NULL AS paid FROM bill_debts WHERE bill_id = ${a.billId}`;
  r.check("…and the row is untouched", stillUnpaid === false);
  res = await callAction(A("/portal"), setPaidAction, [a.billId, a.member.membershipId, true], aAdmin);
  text = await res.text();
  r.check("admin marks it paid → bill status paid", text.includes('"ok":true') && text.includes('"status":"paid"'), text.slice(0, 160));
  res = await callAction(A("/portal"), setPaidAction, [b.billId, b.member.membershipId, true], aAdmin);
  text = await res.text();
  r.check("an admin of A can't touch B's bill (RLS hides it)", text.includes('"ok":false') && text.includes("no longer exists"), text.slice(0, 160));

  r.section("http: other portal actions");
  res = await formPost(A("/portal"), id("app/(household)/[household]/portal/actions.ts", "sendReminder"), { billId: String(b.billId) }, aAdmin);
  r.check("reminder for another household's bill → refused", err(res).includes("no longer exists"), err(res));
  res = await formPost(A("/portal/household"), id("app/(household)/[household]/portal/actions.ts", "saveBillTypeAction"), { name: "Nope", emoji: "❌", processingFee: "0" }, aMember);
  r.check("member adding a bill type → refused", res.status >= 400 || err(res) !== "", res.status);
  res = await formPost(A("/portal/household"), id("app/(household)/[household]/portal/actions.ts", "removeBillTypeAction"), { typeId: String(a.typeId) }, aAdmin);
  r.check("removing a type with bills → friendly refusal", err(res).includes("on record"), err(res));
  const roomie = await addMember(owner, a, `ha-roomie-${RUN}`);
  const lateBill = await owner<{ id: number }[]>`SELECT id FROM bills WHERE id = ${posted.id}`;
  res = await callAction(A("/portal"), setPaidAction, [lateBill[0].id, roomie.membershipId, true], aAdmin);
  r.check("someone who joined after a bill can't be marked on it", (await res.text()).includes("doesn't owe"));

  r.section("http: editing and deleting a bill over the wire");
  const editBill = id("app/(household)/[household]/portal/actions.ts", "editBill");
  const deleteBill = id("app/(household)/[household]/portal/actions.ts", "deleteBillAction");
  const editForm = (amount: string) => {
    const f = billForm(a.memberTypeId, amount, null);
    f.set("billId", String(posted.id));
    return f;
  };
  res = await callAction(A("/portal"), editBill, { state: { errors: [] }, form: editForm("60.00") }, aMember);
  await res.text();
  const [edited] = await owner<{ per: string; kind: string }[]>`SELECT per_person_cost AS per, notice_kind AS kind FROM bills WHERE id = ${posted.id}`;
  r.check("the bill's owner edits it (redirect back with ?ok=, 60.00 → 30.00 each, email still queued)",
    (res.headers.get("x-action-redirect") ?? "").startsWith(A("/portal?ok=")) && Number(edited.per) === 30 && edited.kind === "new", { redirect: res.headers.get("x-action-redirect"), edited });
  const [{ n: roomieRows }] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM bill_debts WHERE bill_id = ${posted.id} AND person_id = ${roomie.membershipId}`;
  r.check("…and the member who joined after the post still isn't a debtor", roomieRows === 0);
  res = await callAction(B("/portal"), editBill, { state: { errors: [] }, form: editForm("60.00") }, bAdmin);
  r.check("someone from another household can't edit it", (await res.text()).includes("no longer exists"));
  res = await callAction(A("/portal"), editBill, { state: { errors: [] }, form: editForm("60.00") }, bAdmin);
  r.check("…nor by posting to its household's URL instead (not a member: refused)", (await res.text()).includes("Sign in to edit bills"));
  res = await callAction(A("/portal"), setPaidAction, [posted.id, a.admin.membershipId, true], aMember);
  await res.text();
  res = await callAction(A("/portal"), editBill, { state: { errors: [] }, form: editForm("70.00") }, aMember);
  r.check("once someone is marked paid, an edit is refused inline", (await res.text()).includes("already been marked paid"));
  res = await formPost(A("/portal"), deleteBill, { billId: String(posted.id) }, aMember);
  r.check("…and so is a delete", err(res).includes("already been marked paid"), err(res));
  res = await callAction(A("/portal"), setPaidAction, [posted.id, a.admin.membershipId, false], aMember);
  await res.text();
  res = await formPost(A("/portal"), deleteBill, { billId: String(posted.id) }, aMember);
  const gone = (await owner`SELECT 1 FROM bills WHERE id = ${posted.id}`).length === 0;
  r.check("unchecked again, the owner deletes it (nobody had been emailed)", gone && ok(res).includes("Nobody had been emailed"), ok(res));
  r.check("…and its PDF is gone from Blob", (await blobExists(posted.pdf!)) === null);
  res = await get(A("/portal"), aAdmin);
  text = await res.text();
  r.check("the portal speaks one status vocabulary (no Settled / Open)", !/>(Settled|Open)</.test(text) && />(Paid|Unpaid)</.test(text));

  r.section("http: the house ledger is gross, with a settling hint");
  const n = await makeHousehold(owner, "hn", "ledger"); // the fixture bill: the member owes the admin 40.00 on Gas
  const N = (p = "") => householdPath(n, p);
  const [water] = await owner<{ id: number }[]>`
    INSERT INTO bills (household_id, type_id, bill_date, due_date, total, per_person_cost, added_by_id, owner_id, had_owner, shares, owner_share)
    VALUES (${n.id}, ${n.memberTypeId}, current_date - 3, current_date + 12, 30.00, 15.00, ${n.member.membershipId}, ${n.member.membershipId}, true, 2, true) RETURNING id`;
  await owner`INSERT INTO bill_debts (household_id, bill_id, person_id) VALUES (${n.id}, ${water.id}, ${n.admin.membershipId})`;
  text = (await (await get(N(), await cookieFor(n.admin.userId))).text()).replaceAll("<!-- -->", "");
  r.check("both directions show as recorded ($40.00 owed to the admin, $15.00 owed by them), never $25.00 as a row",
    text.includes("$40.00") && text.includes("$15.00") && !/figure font-semibold">\$25\.00/.test(text), text.match(/house ledger[\s\S]{0,1500}/)?.[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300));
  r.check("…and the net only in the hint: \"Member hn pays you $25.00 and you both check off each other's bills\"",
    /Settling at once\? Member hn pays you[\s\S]{0,80}\$25\.00[\s\S]{0,40}and you both check off each other(&#x27;|')s bills/.test(text));
  await owner`UPDATE bill_debts SET paid_at = now() WHERE bill_id = ${water.id}`;
  text = (await (await get(N(), await cookieFor(n.admin.userId))).text()).replaceAll("<!-- -->", "");
  r.check("owing nothing, an owner's Next due is the soonest bill owed to them, and who hasn't paid",
    /Next due[\s\S]{0,400}Gas · Member hn hasn(&#x27;|')t paid you/.test(text), text.match(/Next due[\s\S]{0,600}/)?.[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 160));
  text = await (await get(N("/portal/household"), await cookieFor(n.admin.userId))).text();
  r.check("member controls open the shared dialog (no <details> disclosure), named for the member",
    !/<summary[^>]*>Edit</.test(text) && text.includes('aria-label="Edit Member hn"') && /<dialog[^>]*class="dialog/.test(text));

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
  r.check("A's admin asking for B's prefix → 401 (the key's household decides, and they aren't its admin)", res.status === 401, res.status);
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
  let pg = await page(A(), aMember);
  r.check("dashboard renders for a member with their balance", pg.status === 200 && pg.html.includes("You owe") && pg.html.includes("The house ledger"), pg.status);
  pg = await page(A("/portal"), aMember);
  r.check("portal renders for a member (read-only checkboxes on others' bills)", pg.status === 200 && pg.html.includes("Paid back") && pg.html.includes("disabled"), pg.status);
  pg = await page(A("/portal/household"), aAdmin);
  r.check("household tab shows bill types with owners (ledger)", pg.status === 200 && pg.html.includes("Bill types") && pg.html.includes("Owner (pays the provider)"));
  pg = await page(A("/documents"), aAdmin);
  r.check("documents page renders when the feature is on", pg.status === 200 && pg.html.includes("Documents"));
  await owner`UPDATE households SET feature_documents = false WHERE id = ${a.id}`;
  pg = await page(A("/documents"), aAdmin);
  // Under the root loading.tsx the page streams, so notFound() can't change the already-sent
  // 200; what matters is that the not-found UI renders instead of the documents.
  r.check("…and renders not-found when it's off", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("The lease, insurance"), pg.status);
  pg = await page("/demo", "");
  r.check("/demo: the demo dashboard renders from memory, no cookie needed", pg.status === 200 && pg.html.includes("Demo House") && pg.html.includes("The house ledger"));
  r.check("…with its links inside /demo", pg.html.includes('href="/demo/portal"'));
  pg = await page("/demo/portal", aMember);
  r.check("…and a signed-in visitor sees the demo there too, not their own household", pg.html.includes('class="wordmark">Demo House<') && !pg.html.includes('class="wordmark">Verify HA<'));

  r.section("http: the site flow (household URLs)");
  pg = await page("/", aMember);
  r.check("signed in, / is still the public home page", pg.status === 200 && pg.html.includes("data-site") && !pg.html.includes("The house ledger"), pg.status);
  r.check("…whose header opens the household", pg.html.includes(`href="${A()}"`) && pg.html.includes("Open your household"));
  pg = await page("/", "");
  r.check("signed out, / offers Sign in and the demo", pg.html.includes('href="/login"') && pg.html.includes('href="/demo"') && !pg.html.includes("Open your household"));
  res = await get("/login", aMember);
  r.check("Sign in while signed in → straight to the household", res.status === 307 && new URL(res.headers.get("location") ?? "", base).pathname === A(), res.headers.get("location"));
  // Someone in both fixture households; not a splitter, so no later bill math moves.
  const both = await addMember(owner, b, `hab-both-${RUN}`, { splits: false });
  await owner`INSERT INTO memberships (household_id, user_id, role, splits_bills, joined_at) VALUES (${a.id}, ${both.userId}, 'member', false, now())`;
  const bothCookie = await cookieFor(both.userId);
  res = await get("/login", `${bothCookie}; ${HOUSEHOLD_COOKIE}=${b.slug}`);
  r.check("…in two households, to the one opened last", new URL(res.headers.get("location") ?? "", base).pathname === B(), res.headers.get("location"));
  res = await get(`/login?next=${encodeURIComponent(A("/portal"))}`, bothCookie);
  r.check("…or to next= when given", new URL(res.headers.get("location") ?? "", base).pathname === A("/portal"), res.headers.get("location"));
  pg = await page(A(), bothCookie);
  const pgB = await page(B(), bothCookie);
  r.check("one session, two households, each at its own URL with its own name", pg.html.includes('class="wordmark">Verify HA<') && pgB.html.includes('class="wordmark">Verify HB<'));
  r.check("…and the switcher links to each household's URL", pg.html.includes(`href="${B()}"`) && pgB.html.includes(`href="${A()}"`));
  pg = await page(B(), aMember);
  r.check("a household you're not in → not found, nothing of it shown", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("Verify HB"), pg.status);
  pg = await page(B("/portal"), aMember);
  r.check("…on every page of it", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("Verify HB"), pg.status);
  res = await get(A(), "");
  r.check("signed out, a household URL → /login?next= that URL", res.status === 307 && (res.headers.get("location") ?? "").endsWith(`/login?next=${encodeURIComponent(A())}`), res.headers.get("location"));
  pg = await page("/households", bothCookie);
  r.check("/households links every household by its URL", pg.html.includes(`href="${A()}"`) && pg.html.includes(`href="${B()}"`));

  r.section("http: the cron endpoint's lock");
  // Only the refusals go over the wire: an authorized tick would run every household in the
  // database, seed ones included. The authorized path is covered at the library level (cron).
  res = await fetch(`${base}/api/cron/tick`);
  r.check("no Authorization header → 401", res.status === 401, res.status);
  res = await fetch(`${base}/api/cron/tick`, { headers: { authorization: "Bearer not-the-secret" } });
  r.check("wrong secret → 401", res.status === 401, res.status);
  res = await fetch(`${base}/api/cron/tick`, { headers: { authorization: `Basic ${process.env.CRON_SECRET ?? ""}` } });
  r.check("the right secret under the wrong scheme → 401", res.status === 401, res.status);

  r.section("http: settings");
  const saveSettings = id("app/(household)/[household]/portal/settings/actions.ts", "saveSettingsAction");
  const settingsForm = (over: Record<string, string> = {}) => {
    const f = new FormData();
    const fields: Record<string, string> = {
      name: "Verify HA", tagline: "", mode: "ledger", theme: "statement", colorScheme: "system", billsPerPage: "10", feature_thanks: "on",
      remindersEnabled: "on", sendHour: "8", firstReminderDays: "5", urgentReminderDays: "2", timezone: "America/Chicago", fromName: "Oak Crew", replyTo: "", digestEmail: "",
      ...over,
    };
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  pg = await page(A("/portal/settings"), aMember);
  r.check("a member sees settings read-only", pg.status === 200 && pg.html.includes("Only a household admin can change these") && !pg.html.includes("Save settings"), pg.status);
  pg = await page(A("/portal/settings"), aAdmin);
  r.check("an admin gets the form, with the schedule in plain words", pg.status === 200 && pg.html.includes("Save settings") && pg.html.includes("Once it&#x27;s late, one every 3 days"), pg.status);
  res = await callAction(A("/portal/settings"), saveSettings, { state: { errors: [] }, form: settingsForm() }, aMember);
  text = await res.text();
  r.check("member saving settings → refused", text.includes("Only a household admin can do that"), text.slice(0, 200));
  res = await callAction(A("/portal/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ urgentReminderDays: "6", digestEmail: "nope@" }) }, aAdmin);
  text = await res.text();
  r.check("bad values → every error inline, what was typed echoed back", text.includes("after the heads-up") && text.includes("digest address") && text.includes("nope@"), text.slice(0, 300));
  res = await callAction(A("/portal/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ digestEmail: "Digest@Verify.Invalid" }) }, aAdmin);
  await res.text();
  const [saved] = await owner<{ tz: string; hour: number; first: number; digest: string; fromName: string }[]>`
    SELECT timezone AS tz, send_hour AS hour, first_reminder_days AS first, digest_email::text AS digest, from_name AS "fromName" FROM households WHERE id = ${a.id}`;
  r.check("admin saves → redirect with ?ok=, values stored (email normalized)",
    (res.headers.get("x-action-redirect") ?? "").startsWith(A("/portal/settings?ok=")) && saved.tz === "America/Chicago" && saved.hour === 8 && saved.first === 5 && saved.digest === "digest@verify.invalid" && saved.fromName === "Oak Crew", saved);

  r.section("http: bulk email");
  const bulk = id("app/(household)/[household]/portal/email/actions.ts", "sendBulkEmailAction");
  const bulkForm = (subject: string, body: string) => {
    const f = new FormData();
    f.set("subject", subject);
    f.set("body", body);
    return f;
  };
  await owner`UPDATE households SET digest_email = NULL WHERE id = ${a.id}`;
  pg = await page(A("/portal/email"), aAdmin);
  r.check("feature off → not found", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("Goes to"), pg.status);
  await owner`UPDATE households SET feature_bulk_email = true WHERE id = ${a.id}`;
  await addMember(owner, a, `ha-invitee-${RUN}`, { joined: false });
  // Streamed under loading.tsx, a redirect() arrives as a 200 carrying the target, not a 307.
  pg = await page(A("/portal/email"), aMember);
  r.check("a member is sent to /no-access", pg.html.includes(A("/no-access")) && !pg.html.includes("Goes to"), pg.status);
  pg = await page(A("/portal/email"), aAdmin);
  r.check("the admin sees who it goes to (and who it doesn't)", pg.status === 200 && pg.html.includes("Goes to") && pg.html.includes(`Not to ha-invitee-${RUN}`), pg.status);
  res = await callAction(A("/portal/email"), bulk, { state: { errors: [] }, form: bulkForm("", "") }, aAdmin);
  text = await res.text();
  r.check("empty subject and message → both errors inline", text.includes("Add a subject") && text.includes("Write the message"), text.slice(0, 200));
  res = await callAction(A("/portal/email"), bulk, { state: { errors: [] }, form: bulkForm("Hi", "Hello") }, aMember);
  r.check("a member sending → refused", (await res.text()).includes("Only a household admin can do that"));
  const logBefore = server.log.length;
  res = await callAction(A("/portal/email"), bulk, { state: { errors: [] }, form: bulkForm(`Note ${RUN}`, "Rent's due Friday.") }, aAdmin);
  await res.text();
  const sentLog = server.log.slice(logBefore);
  r.check("admin sends → ?ok=, one custom email per joined member, none to the invitee",
    (res.headers.get("x-action-redirect") ?? "").startsWith(A("/portal/email?ok=")) && (sentLog.match(/\[mail:console\] custom to /g) ?? []).length >= 2 && !sentLog.includes(`ha-invitee-${RUN}`),
    res.headers.get("x-action-redirect"));

  r.section("http: sign-in flow (console mail)");
  const fresh = email("signup");
  const loginForm = (actionName: string, fields: Record<string, string>) => formPost("/login", id("app/(app)/login/actions.ts", actionName), fields, "");
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
  r.check("verified → session cookie and onboarding at /new", setCookie.startsWith(`${SESSION_COOKIE}=`) && (res.headers.get("location") ?? "").endsWith("/new"), res.headers.get("location"));
  const [{ n: created }] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM users WHERE email = ${fresh}`;
  r.check("the users row exists only after verifying", created === 1);

  // ---------------------------------------------------------------------------------------------
  r.section("http: the calendar feed (/cal.ics?k=)");
  const tokenOf = async (membershipId: number) => (await owner<{ k: string }[]>`SELECT calendar_token AS k FROM memberships WHERE id = ${membershipId}`)[0]?.k;
  const feed = async (k: string) => {
    const x = await fetch(`${base}/cal.ics?k=${encodeURIComponent(k)}`, { redirect: "manual" });
    return { status: x.status, type: x.headers.get("content-type") ?? "", cache: x.headers.get("cache-control") ?? "", body: await x.text() };
  };
  const kA = (await tokenOf(a.member.membershipId))!;
  let cal = await feed(kA);
  r.check("a member's token, no cookie → their household's feed", cal.status === 200 && cal.type.startsWith("text/calendar") && cal.body.startsWith("BEGIN:VCALENDAR\r\n"), cal.status);
  r.check("…cached by the client only, never a shared cache", /private/.test(cal.cache) && !/public|s-maxage/.test(cal.cache), cal.cache);
  const aBills = (await owner<{ id: number }[]>`SELECT id FROM bills WHERE household_id = ${a.id}`).map((x) => x.id);
  const bBills = (await owner<{ id: number }[]>`SELECT id FROM bills WHERE household_id = ${b.id}`).map((x) => x.id);
  r.check("…every bill of that household, and nothing from another", aBills.every((i) => cal.body.includes(`UID:bill-${i}@`)) && !bBills.some((i) => cal.body.includes(`UID:bill-${i}@`)), { aBills, bBills });
  const empty = (x: { status: number; body: string }) => x.status === 404 && x.body === "";
  r.check("no token → 404, empty", empty(await feed("")));
  r.check("a malformed token → 404, empty", empty(await feed("not-a-token")));
  r.check("a well-formed token nobody holds → 404, empty", empty(await feed("A".repeat(43))));
  r.check("another household's member's token → only their household", (await feed((await tokenOf(b.member.membershipId))!)).body.includes(`UID:bill-${b.billId}@`));

  const resetAction = id("app/(app)/account/actions.ts", "resetCalendarLink");
  res = await formPost("/account", resetAction, { householdId: String(b.id) }, aMember);
  r.check("resetting a calendar link in a household you're not in → refused", err(res) !== "" && (await tokenOf(a.member.membershipId)) === kA, err(res));
  res = await formPost("/account", resetAction, { householdId: String(a.id) }, aMember);
  const kA2 = (await tokenOf(a.member.membershipId))!;
  r.check("reset my calendar link → ?ok= and a new token", res.status === 303 && (res.headers.get("location") ?? "").includes("ok=") && kA2 !== kA, res.status);
  r.check("…the old link returns nothing", empty(await feed(kA)));
  r.check("…the new one works", (await feed(kA2)).status === 200);
  r.check("…and the admin's link is untouched", (await feed((await tokenOf(a.admin.membershipId))!)).status === 200);
  const leaver = await addMember(owner, a, `ha-leaver-${RUN}`);
  const kLeaver = (await tokenOf(leaver.membershipId))!;
  r.check("a member's feed works while they're in the household", (await feed(kLeaver)).status === 200);
  await owner`DELETE FROM memberships WHERE id = ${leaver.membershipId}`;
  r.check("…and returns nothing once they're removed", empty(await feed(kLeaver)));
  pg = await page("/account", aMember);
  r.check("/account shows the subscribe buttons and the current link", pg.html.includes("webcal://") && pg.html.includes(encodeURIComponent(kA2)) && pg.html.includes("Reset my calendar link"));
  pg = await page(A(), aMember);
  r.check("the dashboard has Apple and Google subscribe buttons for the viewer's own link", pg.html.includes(`webcal://`) && pg.html.includes("calendar.google.com/calendar/r?cid=") && pg.html.includes(encodeURIComponent(kA2)) && !pg.html.includes(encodeURIComponent((await tokenOf(a.admin.membershipId))!)));

  // ---------------------------------------------------------------------------------------------
  r.section("http: disabled features are hidden and refused");
  await owner`UPDATE households SET feature_trends = false, feature_documents = false, feature_bulk_email = false, feature_welcome_tour = false WHERE id = ${a.id}`;
  const hrefs = (html: string) => new Set([...html.matchAll(/href="(\/[a-z0-9/-]*)"/g)].map((m) => m[1]));
  pg = await page(A(), aAdmin);
  let nav = hrefs(pg.html);
  r.check("all off: no Trends or Docs in the nav, no tour link in the footer", !nav.has(A("/trends")) && !nav.has(A("/documents")) && !nav.has(A("/welcome")), [...nav]);
  pg = await page(A("/portal"), aAdmin);
  r.check("…and no Email tab in the portal", !hrefs(pg.html).has(A("/portal/email")));
  pg = await page(A("/trends"), aAdmin);
  r.check("/trends → not found", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("Totals by bill type"), pg.status);
  res = await get(A("/trends/csv"), aAdmin);
  r.check("/trends/csv → 404", res.status === 404, res.status);
  pg = await page(A("/welcome"), aMember);
  r.check("/welcome → not found", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("Step 1 of"), pg.status);
  const finish = id("app/(household)/[household]/welcome/actions.ts", "finishWelcome");
  await owner`UPDATE memberships SET welcomed_at = NULL WHERE id = ${a.member.membershipId}`;
  res = await formPost(A("/welcome"), finish, {}, aMember);
  let [{ w }] = await owner<{ w: Date | null }[]>`SELECT welcomed_at AS w FROM memberships WHERE id = ${a.member.membershipId}`;
  r.check("finishing the tour while it's off records nothing", w === null, res.status);

  await owner`UPDATE households SET feature_trends = true, feature_documents = true, feature_bulk_email = true, feature_welcome_tour = true WHERE id = ${a.id}`;
  pg = await page(A(), aAdmin);
  nav = hrefs(pg.html);
  r.check("all on: Trends and Docs in the nav, the tour in the footer", nav.has(A("/trends")) && nav.has(A("/documents")) && nav.has(A("/welcome")), [...nav]);
  pg = await page(A("/portal"), aAdmin);
  r.check("…and the Email tab for an admin", hrefs(pg.html).has(A("/portal/email")));
  pg = await page(A("/trends"), aMember);
  r.check("/trends renders the chart and the totals", pg.status === 200 && pg.html.includes("Totals by bill type") && pg.html.includes("Download CSV"), pg.status);
  res = await get(A("/trends/csv"), aMember);
  text = await res.text();
  r.check("/trends/csv: a CSV attachment, one column per type", res.status === 200 && (res.headers.get("content-type") ?? "").startsWith("text/csv") && /attachment/.test(res.headers.get("content-disposition") ?? "") && text.startsWith("Month,Gas,Water,Total"), text.slice(0, 80));
  res = await get(A("/trends/csv"));
  r.check("…and not without a session", res.status !== 200, res.status);

  r.section("http: the welcome tour");
  pg = await page(A(), aMember);
  r.check("a member who hasn't seen it is sent to the tour first", pg.html.includes(A("/welcome")) && !pg.html.includes("The house ledger"), pg.status);
  pg = await page(A("/welcome"), aMember);
  r.check("ledger households hear about owners", pg.status === 200 && pg.html.includes("Every bill has an owner") && pg.html.includes("Step 1 of"));
  res = await formPost(A("/welcome"), finish, {}, aMember);
  [{ w }] = await owner<{ w: Date | null }[]>`SELECT welcomed_at AS w FROM memberships WHERE id = ${a.member.membershipId}`;
  r.check("finishing records it and opens the dashboard", w !== null && res.status === 303 && (res.headers.get("location") ?? "").endsWith(A()), res.status);
  pg = await page(A(), aMember);
  r.check("…which renders normally from then on", pg.html.includes("The house ledger"));
  await owner`UPDATE households SET mode = 'single_payer' WHERE id = ${a.id}`;
  pg = await page(A("/welcome"), aMember);
  r.check("single-payer households hear about the payer instead", pg.html.includes("One person pays every bill") && !pg.html.includes("Every bill has an owner"));
  await owner`UPDATE households SET mode = 'ledger' WHERE id = ${a.id}`;

  r.section("http: theme");
  pg = await page(A(), aMember);
  r.check("statement by default: data-theme and the household's scheme on <html>", /<html[^>]*data-theme="statement"[^>]*data-color-scheme="system"/.test(pg.html));
  res = await callAction(A("/portal/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ theme: "peach", colorScheme: "system" }) }, aAdmin);
  await res.text();
  pg = await page(A(), aMember);
  r.check("an admin saves peach → every member's next page is peach, light", /<html[^>]*data-theme="peach"[^>]*data-color-scheme="light"/.test(pg.html), pg.html.match(/<html[^>]*>/)?.[0]);
  r.check("…with the awning and the peach page color in the browser chrome", pg.html.includes('class="awning"') && pg.html.includes('name="theme-color" content="#faf3e7"'));
  r.check("…while the peach faces stay unpreloaded (only the default ledger face is)", (pg.html.match(/rel="preload"[^>]*as="font"/g) ?? []).length <= 1);
  res = await callAction(A("/portal/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ theme: "statement", colorScheme: "light" }) }, aAdmin);
  await res.text();
  pg = await page(A(), aMember);
  r.check("…and back to statement, always light", /<html[^>]*data-theme="statement"[^>]*data-color-scheme="light"/.test(pg.html));

  r.section("http: mode switch over the wire");
  res = await callAction(A("/portal/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ mode: "single_payer", payerId: String(a.admin.membershipId) }) }, aAdmin);
  await res.text();
  const [{ mode }] = await owner<{ mode: string }[]>`SELECT mode FROM households WHERE id = ${a.id}`;
  const typeOwners = await owner<{ o: number }[]>`SELECT owner_id AS o FROM bill_types WHERE household_id = ${a.id}`;
  r.check("admin switches to single payer → mode saved, every type owned by the payer", mode === "single_payer" && typeOwners.every((t) => t.o === a.admin.membershipId) && (res.headers.get("x-action-redirect") ?? "").includes("ok="), { mode, typeOwners });
  pg = await page(A("/portal/household"), aAdmin);
  r.check("…and the owner column is gone from bill types", !pg.html.includes("Owner (pays the provider)"));
}

// Shared plumbing for `npm run verify`: the dev-branch guard, connections, check(), and the
// throwaway fixture households each suite builds and removes.
//
// scripts/verify/ is the one place besides lib/db.ts that imports postgres and reads
// DATABASE_URL_ADMIN (CLAUDE.md): probing RLS needs raw transactions with and without GUCs,
// on pooled and direct connections, plus an owner connection to build fixtures. It only ever
// runs against the Neon dev branch.

import { randomBytes } from "node:crypto";
import postgres from "postgres";
import type { Ctx } from "@/lib/context";
import type { Mailer } from "@/lib/mail";

// The dev branch of Neon project "lejer" (CLAUDE.md, Deployment). main is ep-little-cake.
// blobStore is lejer-blob's id: the Blob token must belong to it and nothing else.
export const DEV = {
  project: "round-grass-59501457",
  branch: "br-spring-wildflower-b8jxabk0",
  endpoint: "ep-cold-shadow-b8s9z1fi",
  blobStore: "kmuAqgMI8w1nbg75",
} as const;

export type Sql = postgres.Sql<Record<string, never>>;
export type Tx = postgres.TransactionSql<Record<string, never>>;

const opts = { prepare: false, max: 1, onnotice: () => {} } as const;

/**
 * Refuses anything but dev: by hostname before connecting (owner = direct dev endpoint, app =
 * pooled dev endpoint), then by the branch the server reports after connecting.
 */
export async function connectDev(): Promise<{ owner: Sql; app: Sql; appDirect: Sql }> {
  guardBlobStore();
  const ownerUrl = new URL(required("DATABASE_URL_ADMIN"));
  const appUrl = new URL(required("DATABASE_URL"));
  if (!ownerUrl.hostname.startsWith(`${DEV.endpoint}.`)) {
    refuse(`DATABASE_URL_ADMIN host ${ownerUrl.hostname} is not the dev endpoint (direct)`);
  }
  if (!appUrl.hostname.startsWith(`${DEV.endpoint}-pooler.`)) {
    refuse(`DATABASE_URL host ${appUrl.hostname} is not the dev endpoint (pooled)`);
  }
  const directUrl = new URL(appUrl);
  directUrl.hostname = appUrl.hostname.replace(`${DEV.endpoint}-pooler.`, `${DEV.endpoint}.`);

  const owner = postgres(ownerUrl.toString(), opts) as unknown as Sql;
  const app = postgres(appUrl.toString(), opts) as unknown as Sql;
  const appDirect = postgres(directUrl.toString(), opts) as unknown as Sql;
  for (const [name, sql] of [["owner", owner], ["app", app], ["app direct", appDirect]] as const) {
    const [r] = await sql<{ branch: string; project: string; usr: string }[]>`
      SELECT current_setting('neon.branch_id', true) AS branch,
             current_setting('neon.project_id', true) AS project, current_user AS usr`;
    if (r.branch !== DEV.branch || r.project !== DEV.project) {
      await Promise.all([owner.end(), app.end(), appDirect.end()]);
      refuse(`${name} connection reports branch ${r.branch} of ${r.project}, not dev`);
    }
    const expected = name === "owner" ? "neondb_owner" : "lejer_app";
    if (r.usr !== expected) refuse(`${name} connection is ${r.usr}, expected ${expected}`);
  }
  return { owner, app, appDirect };
}

/**
 * Suites write real blobs (and the sweep deletes by prefix), so the token must be lejer-blob's.
 * A read-write token embeds its store id: vercel_blob_rw_<storeId>_<secret>.
 */
function guardBlobStore(): void {
  const token = required("BLOB_READ_WRITE_TOKEN");
  const store = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(token)?.[1];
  if (store !== DEV.blobStore) refuse(`BLOB_READ_WRITE_TOKEN belongs to store ${store ?? "(unrecognized token)"}, not lejer-blob`);
  const id = process.env.BLOB_STORE_ID;
  if (id && id.replace(/^store_/, "") !== DEV.blobStore) refuse(`BLOB_STORE_ID ${id} is not lejer-blob`);
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) refuse(`${name} is not set (see CLAUDE.md, Recovering .env.local)`);
  return v;
}

function refuse(msg: string): never {
  console.error(`verify: refusing to run: ${msg}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------
// Checks

export class Results {
  passed = 0;
  failed: string[] = [];
  constructor(private suite = "") {}
  section(name: string) {
    this.suite = name;
    console.log(`\n# ${name}`);
  }
  check(name: string, ok: boolean, detail?: unknown) {
    if (ok) this.passed++;
    else this.failed.push(`${this.suite}: ${name}`);
    const extra = detail === undefined ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : extra}`);
  }
  /** Passes when fn throws (optionally with a message matching re). */
  async throws(name: string, fn: () => Promise<unknown>, re?: RegExp) {
    try {
      await fn();
      this.check(name, false, "did not throw");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.check(name, !re || re.test(msg), msg);
    }
  }
}

/** Runs fn in a transaction that is always rolled back. */
export async function rolledBack<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out: T;
  const marker = new Error("rollback");
  try {
    await sql.begin(async (tx) => {
      out = await fn(tx);
      throw marker;
    });
  } catch (e) {
    if (e !== marker) throw e;
  }
  return out!;
}

// ---------------------------------------------------------------------------------------------
// Fixtures: households named verify-<run>-*, users @verify.invalid. Each run sweeps leftovers
// from crashed runs first; cleanup() removes its own (households cascade to everything).

export const RUN = randomBytes(3).toString("hex");
export const FIXTURE_DOMAIN = "verify.invalid";
export const email = (who: string) => `${who}-${RUN}@${FIXTURE_DOMAIN}`;
/** email_log rows the suites write carry this to_hash so cleanup can find them. */
export const LOG_MARK = "f".repeat(64);

export async function sweep(owner: Sql): Promise<void> {
  // Blobs first, by prefix, for every fixture household still in the database (including ones
  // a crashed run left behind); only then the rows, so a crash mid-sweep is retried next time.
  const { deletePrefix, householdPrefix } = await import("@/lib/blob");
  const leftovers = await owner<{ id: number }[]>`SELECT id FROM households WHERE slug LIKE 'verify-%'`;
  for (const { id } of leftovers) await deletePrefix(householdPrefix(id));
  await owner`DELETE FROM households WHERE slug LIKE 'verify-%'`;
  await owner`DELETE FROM users WHERE email LIKE ${"%@" + FIXTURE_DOMAIN}`;
  await owner`DELETE FROM login_codes WHERE email LIKE ${"%@" + FIXTURE_DOMAIN}`;
  await owner`DELETE FROM email_log WHERE to_hash = ${LOG_MARK}`;
}

export interface Fixture {
  id: number;
  slug: string;
  admin: { userId: number; membershipId: number };
  member: { userId: number; membershipId: number };
  typeId: number; // owned by the admin
  memberTypeId: number; // owned by the member
  billId: number; // unpaid, member owes
}

/** A household with an admin, a member, two bill types (one each), and one unpaid bill. */
export async function makeHousehold(owner: Sql, tag: string, mode: "single_payer" | "ledger" = "ledger"): Promise<Fixture> {
  const slug = `verify-${RUN}-${tag}`;
  const [h] = await owner<{ id: number }[]>`
    INSERT INTO households (slug, name, mode) VALUES (${slug}, ${`Verify ${tag.toUpperCase()}`}, ${mode}) RETURNING id`;
  const users = await owner<{ id: number; email: string }[]>`
    INSERT INTO users (email, name) VALUES (${email(`${tag}-admin`)}, ${`Admin ${tag}`}), (${email(`${tag}-member`)}, ${`Member ${tag}`})
    RETURNING id, email`;
  const [admin, member] = [users.find((u) => u.email.includes("-admin-"))!, users.find((u) => u.email.includes("-member-"))!];
  const ms = await owner<{ id: number; userId: number }[]>`
    INSERT INTO memberships (household_id, user_id, role, joined_at)
    VALUES (${h.id}, ${admin.id}, 'admin', now()), (${h.id}, ${member.id}, 'member', now())
    RETURNING id, user_id AS "userId"`;
  const am = ms.find((m) => m.userId === admin.id)!.id;
  const mm = ms.find((m) => m.userId === member.id)!.id;
  const types = await owner<{ id: number; ownerId: number }[]>`
    INSERT INTO bill_types (household_id, name, emoji, owner_id)
    VALUES (${h.id}, 'Gas', '🔥', ${am}), (${h.id}, 'Water', '💧', ${mode === "single_payer" ? am : mm})
    RETURNING id, owner_id AS "ownerId"`;
  const typeId = types[0].id;
  const [bill] = await owner<{ id: number }[]>`
    INSERT INTO bills (household_id, type_id, bill_date, due_date, total, per_person_cost, added_by_id, owner_id, had_owner)
    VALUES (${h.id}, ${typeId}, current_date - 5, current_date + 10, 80.00, 40.00, ${am}, ${am}, true) RETURNING id`;
  await owner`INSERT INTO bill_debts (household_id, bill_id, person_id) VALUES (${h.id}, ${bill.id}, ${mm})`;
  await owner`INSERT INTO payment_thanks (household_id, bill_id, person_id) VALUES (${h.id}, ${bill.id}, ${mm})`;
  await owner`
    INSERT INTO documents (household_id, title, category, file_path, content_type, file_size, uploaded_by)
    VALUES (${h.id}, 'Lease', 'lease', ${`h/${h.id}/documents/lease-${RUN}.pdf`}, 'application/pdf', 1000, ${am})`;
  await owner`INSERT INTO email_log (household_id, kind, to_hash, ok) VALUES (${h.id}, 'verify', ${LOG_MARK}, true)`;
  return {
    id: h.id,
    slug,
    admin: { userId: admin.id, membershipId: am },
    member: { userId: member.id, membershipId: mm },
    typeId,
    memberTypeId: types[1].id,
    billId: bill.id,
  };
}

/** A real request context for a fixture user in a fixture household (no cookies involved). */
export async function ctxFor(userId: number, householdId: number): Promise<Ctx> {
  const { withUser } = await import("@/lib/db");
  const { findMembership, getUserById } = await import("@/lib/households");
  return withUser(userId, async (tx) => {
    const user = (await getUserById(tx, userId))!;
    const found = await findMembership(tx, userId, householdId);
    if (!found || found.household.id !== householdId) throw new Error(`user ${userId} is not in household ${householdId}`);
    return { user, ...found, demo: false };
  });
}

/** Adds a member to a fixture household (owner connection). */
export async function addMember(owner: Sql, h: { id: number }, tag: string, opts: { splits?: boolean; role?: "admin" | "member"; joined?: boolean } = {}) {
  const [u] = await owner<{ id: number }[]>`INSERT INTO users (email, name) VALUES (${email(tag)}, ${tag}) RETURNING id`;
  const [m] = await owner<{ id: number }[]>`
    INSERT INTO memberships (household_id, user_id, role, splits_bills, joined_at)
    VALUES (${h.id}, ${u.id}, ${opts.role ?? "member"}, ${opts.splits ?? true}, ${opts.joined === false ? null : new Date()})
    RETURNING id`;
  return { userId: u.id, membershipId: m.id };
}

export interface Sent {
  kind: string;
  to: string;
  subject: string;
  replyTo?: string | null;
}

/** A Mailer that records instead of sending. `fail(to)` decides failures; `gate` holds sends. */
export function recorder(opts: { fail?: (to: string) => boolean; gate?: Promise<void>; entered?: () => void } = {}) {
  const sent: Sent[] = [];
  const failed: Sent[] = [];
  const one = (m: Sent) => {
    const ok = !opts.fail?.(m.to);
    (ok ? sent : failed).push(m);
    return ok;
  };
  const mailer: Mailer = {
    send: async (a) => {
      opts.entered?.();
      await opts.gate;
      return one({ kind: a.kind, to: a.to, subject: a.subject, replyTo: a.replyTo });
    },
    sendBatch: async (_ctx, msgs) => {
      opts.entered?.();
      await opts.gate;
      return msgs.map((a) => one({ kind: a.kind, to: a.to, subject: a.subject, replyTo: a.replyTo }));
    },
  };
  return { mailer, sent, failed };
}

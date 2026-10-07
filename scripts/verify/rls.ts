// Row-level security: the second lock (DESIGN.md §4). Rebuilt in the repo from the phase 1
// probe's coverage: fail-closed without GUCs (pooled and direct), '' → NULL on a reused
// backend, no cross-household reads or writes, composite FKs, switcher reads, interleaved
// pooled transactions, owner exemption, and the role/table settings that make it all hold.

import { withHousehold, withUser } from "@/lib/db";
import { LOG_MARK, type Fixture, type Results, type Sql, type Tx, makeHousehold, rolledBack } from "./harness";

const TENANT_TABLES = ["bill_types", "bills", "bill_debts", "payment_thanks", "documents", "email_log"] as const;
const RLS_TABLES = ["households", "memberships", ...TENANT_TABLES] as const;

export async function rls(r: Results, { owner, app, appDirect }: { owner: Sql; app: Sql; appDirect: Sql }) {
  r.section("rls: roles and table settings");
  const [role] = await owner<{ bypass: boolean; superuser: boolean; neonSuper: boolean }[]>`
    SELECT rolbypassrls AS bypass, rolsuper AS superuser,
           pg_has_role('lejer_app', 'neon_superuser', 'MEMBER') AS "neonSuper"
    FROM pg_roles WHERE rolname = 'lejer_app'`;
  r.check("lejer_app is NOBYPASSRLS", role.bypass === false);
  r.check("lejer_app is not a superuser", role.superuser === false);
  r.check("lejer_app is not in neon_superuser", role.neonSuper === false);
  const flags = await owner<{ relname: string; rls: boolean; forced: boolean }[]>`
    SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS forced
    FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`;
  const flag = (t: string) => flags.find((f) => f.relname === t);
  for (const t of RLS_TABLES) r.check(`${t}: RLS enabled, not forced`, flag(t)?.rls === true && flag(t)?.forced === false, flag(t));
  for (const t of ["users", "login_codes"]) r.check(`${t}: no RLS (login runs before a household)`, flag(t)?.rls === false);
  await r.throws("lejer_app cannot read schema_migrations", () => app`SELECT 1 FROM schema_migrations LIMIT 1`, /permission denied/);

  const a = await makeHousehold(owner, "a");
  const b = await makeHousehold(owner, "b");
  // A user in both households, for the switcher checks.
  const [both] = await owner<{ id: number }[]>`
    INSERT INTO users (email, name) SELECT replace(email, '-admin-', '-both-'), 'Both' FROM users WHERE id = ${a.admin.userId}
    RETURNING id`;
  await owner`INSERT INTO memberships (household_id, user_id, role, joined_at)
              VALUES (${a.id}, ${both.id}, 'member', now()), (${b.id}, ${both.id}, 'member', now())`;

  r.section("rls: fail closed without a household");
  for (const [label, sql] of [["pooled", app], ["direct", appDirect]] as const) {
    for (const t of RLS_TABLES) {
      const [{ n }] = await sql.begin((tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM ${tx(t)}`);
      r.check(`${label}, no GUC: ${t} shows 0 rows`, n === 0, n);
    }
  }
  await r.throws("no GUC: INSERT into bills refused", () =>
    app.begin((tx) => tx`INSERT INTO bills (household_id, type_id, bill_date, due_date, total, per_person_cost)
                         VALUES (${a.id}, ${a.typeId}, current_date, current_date, 1, 1)`), /row-level security/);
  const upd = await app.begin((tx) => tx`UPDATE bills SET total = 0 WHERE household_id = ${a.id}`);
  r.check("no GUC: UPDATE touches 0 rows", upd.count === 0);
  const del = await app.begin((tx) => tx`DELETE FROM bill_debts WHERE household_id = ${a.id}`);
  r.check("no GUC: DELETE touches 0 rows", del.count === 0);

  r.section("rls: '' after SET LOCAL reads as NULL");
  // Direct: same session, so the finished SET LOCAL leaves the placeholder at ''.
  await appDirect.begin((tx) => tx`SELECT set_config('app.household_id', ${String(a.id)}, true)`);
  const [direct] = await appDirect.begin((tx) => tx<{ raw: string | null; hid: number | null; n: number }[]>`
    SELECT current_setting('app.household_id', true) AS raw, app_household_id() AS hid,
           (SELECT count(*)::int FROM bills) AS n`);
  r.check("direct: leftover setting is '' and app_household_id() is NULL, 0 rows", direct.raw === "" && direct.hid === null && direct.n === 0, direct);
  // Pooled: PgBouncer may hand us a different backend, so retry until one is reused.
  let sawEmpty = false;
  let pooledOk = true;
  for (let i = 0; i < 20 && !sawEmpty; i++) {
    await app.begin((tx) => tx`SELECT set_config('app.household_id', ${String(a.id)}, true)`);
    const [p] = await app.begin((tx) => tx<{ raw: string | null; hid: number | null; n: number }[]>`
      SELECT current_setting('app.household_id', true) AS raw, app_household_id() AS hid,
             (SELECT count(*)::int FROM bills) AS n`);
    if (p.raw === "") sawEmpty = true;
    if (p.hid !== null || p.n !== 0) pooledOk = false;
  }
  r.check("pooled: a reused backend showed '' (NULLIF path exercised)", sawEmpty);
  r.check("pooled: never leaked a household between transactions", pooledOk);

  r.section("rls: no cross-household reads or writes");
  await inHousehold(app, a, async (tx) => {
    for (const t of TENANT_TABLES) {
      const [{ mine, theirs }] = await tx<{ mine: number; theirs: number }[]>`
        SELECT count(*) FILTER (WHERE household_id = ${a.id})::int AS mine,
               count(*) FILTER (WHERE household_id <> ${a.id})::int AS theirs FROM ${tx(t)}`;
      r.check(`A sees its ${t} and nothing else`, mine > 0 && theirs === 0, { mine, theirs });
    }
    const hs = await tx<{ id: number }[]>`SELECT id FROM households`;
    r.check("A (no user) sees only its own household row", hs.length === 1 && hs[0].id === a.id, hs);
    const ms = await tx<{ hid: number }[]>`SELECT DISTINCT household_id AS hid FROM memberships`;
    r.check("A (no user) sees only its own memberships", ms.length === 1 && ms[0].hid === a.id, ms);
  });
  await rolledBack(app, async (tx) => {
    await tx`SELECT set_config('app.household_id', ${String(a.id)}, true)`;
    const u = await tx`UPDATE bills SET total = 0 WHERE id = ${b.billId}`;
    const d = await tx`DELETE FROM bill_debts WHERE bill_id = ${b.billId}`;
    const h = await tx`UPDATE households SET name = 'x' WHERE id = ${b.id}`;
    const m = await tx`DELETE FROM memberships WHERE household_id = ${b.id}`;
    r.check("A cannot UPDATE B's bill", u.count === 0);
    r.check("A cannot DELETE B's debts", d.count === 0);
    r.check("A cannot UPDATE B's household row", h.count === 0);
    r.check("A cannot DELETE B's memberships", m.count === 0);
  });
  await r.throws("A cannot INSERT a row labelled B", () => rolledBack(app, async (tx) => {
    await tx`SELECT set_config('app.household_id', ${String(a.id)}, true)`;
    await tx`INSERT INTO documents (household_id, title, category, file_path, content_type, file_size)
             VALUES (${b.id}, 'x', 'x', ${`h/${b.id}/documents/x`}, 'application/pdf', 1)`;
  }), /row-level security/);
  await r.throws("A cannot move its own row into B (WITH CHECK)", () => rolledBack(app, async (tx) => {
    await tx`SELECT set_config('app.household_id', ${String(a.id)}, true)`;
    await tx`UPDATE bill_types SET household_id = ${b.id} WHERE id = ${a.typeId}`;
  }), /row-level security|violates/);
  const [bAfter] = await owner<{ total: number; debts: number }[]>`
    SELECT b.total, (SELECT count(*)::int FROM bill_debts WHERE bill_id = b.id) AS debts FROM bills b WHERE id = ${b.billId}`;
  r.check("B's data untouched afterwards", Number(bAfter.total) === 80 && bAfter.debts === 1, bAfter);

  r.section("rls: composite FKs keep children inside their household");
  const fkCases: [string, (tx: Tx) => Promise<unknown>][] = [
    ["debt pointing at B's bill", (tx) => tx`INSERT INTO bill_debts (household_id, bill_id, person_id) VALUES (${a.id}, ${b.billId}, ${a.member.membershipId})`],
    ["debt for B's member", (tx) => tx`INSERT INTO bill_debts (household_id, bill_id, person_id) VALUES (${a.id}, ${a.billId}, ${b.member.membershipId})`],
    ["bill of B's type", (tx) => tx`INSERT INTO bills (household_id, type_id, bill_date, due_date, total, per_person_cost) VALUES (${a.id}, ${b.typeId}, current_date, current_date, 1, 1)`],
    ["type owned by B's member", (tx) => tx`UPDATE bill_types SET owner_id = ${b.admin.membershipId} WHERE id = ${a.typeId}`],
    ["thanks for B's bill", (tx) => tx`INSERT INTO payment_thanks (household_id, bill_id, person_id) VALUES (${a.id}, ${b.billId}, ${a.member.membershipId})`],
    ["document uploaded by B's member", (tx) => tx`UPDATE documents SET uploaded_by = ${b.admin.membershipId} WHERE household_id = ${a.id}`],
    ["bill PDF outside its prefix", (tx) => tx`UPDATE bills SET pdf_path = ${`h/${b.id}/bills/x.pdf`} WHERE id = ${a.billId}`],
  ];
  for (const [name, fn] of fkCases) {
    await r.throws(`owner (RLS-exempt) still cannot create ${name}`, () => rolledBack(owner, fn), /foreign key|check constraint/);
  }

  r.section("rls: the switcher (user only, no household)");
  await withUser(both.id, async (tx) => {
    const hs = await tx<{ id: number }[]>`SELECT id FROM households ORDER BY id`;
    r.check("sees exactly the two households they belong to", hs.map((h) => h.id).join() === [a.id, b.id].sort((x, y) => x - y).join(), hs);
    const ms = await tx<{ uid: number }[]>`SELECT user_id AS uid FROM memberships`;
    r.check("sees only their own memberships", ms.length === 2 && ms.every((m) => m.uid === both.id), ms.length);
    const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM bills`;
    r.check("sees no bills", n === 0);
  });
  await withUser(a.admin.userId, async (tx) => {
    const hs = await tx<{ id: number }[]>`SELECT id FROM households`;
    r.check("a single-household user sees only theirs", hs.length === 1 && hs[0].id === a.id);
  });
  await rolledBack(app, async (tx) => {
    await tx`SELECT set_config('app.household_id', ${String(a.id)}, true), set_config('app.user_id', ${String(both.id)}, true)`;
    const ms = await tx<{ hid: number }[]>`SELECT household_id AS hid FROM memberships WHERE user_id = ${both.id}`;
    r.check("in A, the union read shows my membership in B too", ms.some((m) => m.hid === b.id));
    const w = await tx`UPDATE memberships SET splits_bills = false WHERE user_id = ${both.id} AND household_id = ${b.id}`;
    r.check("…but writes stay household-only (can't edit my B membership from A)", w.count === 0);
  });

  r.section("rls: email_log");
  await inHousehold(app, a, async (tx) => {
    const rows = await tx<{ hid: number | null }[]>`SELECT household_id AS hid FROM email_log`;
    r.check("A reads only its own email_log rows (no NULL rows)", rows.length > 0 && rows.every((x) => x.hid === a.id));
    const u = await tx`UPDATE email_log SET ok = false WHERE household_id = ${a.id}`;
    const d = await tx`DELETE FROM email_log WHERE household_id = ${a.id}`;
    r.check("email_log is append-only for lejer_app", u.count === 0 && d.count === 0);
  });
  const nullInsert = await app.begin((tx) => tx`INSERT INTO email_log (household_id, kind, to_hash, ok) VALUES (NULL, 'verify', ${LOG_MARK}, true)`).then(() => true, () => false);
  r.check("NULL-household insert works without RETURNING", nullInsert);
  await r.throws("…and fails with RETURNING (SELECT policy)", () =>
    app.begin((tx) => tx`INSERT INTO email_log (household_id, kind, to_hash, ok) VALUES (NULL, 'verify', ${LOG_MARK}, true) RETURNING id`), /row-level security/);
  const [{ n: sends }] = await app.begin((tx) => tx<{ n: number }[]>`SELECT email_sends_since(now() - interval '1 hour', 'verify') AS n`);
  r.check("email_sends_since counts across households and NULL rows (definer)", sends >= 3, sends);
  const [acl] = await owner<{ acl: string }[]>`SELECT proacl::text AS acl FROM pg_proc WHERE proname = 'email_sends_since'`;
  r.check("email_sends_since not executable by PUBLIC", !/(^|[{,])=X/.test(acl.acl), acl.acl);

  r.section("rls: interleaved pooled transactions");
  const runs = await Promise.all(
    Array.from({ length: 60 }, (_, i) => {
      const h = i % 2 ? a : b;
      return withHousehold({ household: { id: h.id }, user: null }, async (tx) => {
        await tx`SELECT pg_sleep(${(i % 5) * 0.005})`;
        const rows = await tx<{ hid: number }[]>`SELECT DISTINCT household_id AS hid FROM bills`;
        return rows.length === 1 && rows[0].hid === h.id;
      });
    }),
  );
  r.check("60 concurrent withHousehold transactions each saw only their household", runs.every(Boolean), runs.filter((x) => !x).length + " leaked");

  r.section("rls: owner is exempt");
  const [{ n: ownerSees }] = await owner<{ n: number }[]>`SELECT count(DISTINCT household_id)::int AS n FROM bills WHERE household_id IN (${a.id}, ${b.id})`;
  r.check("owner sees both households without any GUC", ownerSees === 2);
}

async function inHousehold(app: Sql, h: Fixture, fn: (tx: Tx) => Promise<void>) {
  await app.begin(async (tx) => {
    await tx`SELECT set_config('app.household_id', ${String(h.id)}, true)`;
    await fn(tx);
  });
}

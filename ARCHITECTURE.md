# Lejer — architecture

Lejer (lejer.app) merges two Next.js apps that share a lineage into one hosted, multi-tenant
household-bills app:

- **utilities** (`../utilities`, 77 N Union #3): one person pays every bill, everyone owes them.
- **peach-cob** (`../peach-cob`, 404 Parke Ave): each bill type has an owner who fronts it, and
  debts run to that owner. Forked from utilities in July 2026; ~85% identical code.

Stack: Next.js 16 (App Router) + TypeScript + Tailwind v4, one Vercel Hobby deployment, Neon
Postgres, Vercel Blob (private store), Resend. Households sign up and invite their roommates.
Small scale (a handful of households), free tiers, no billing.

This document records the decisions. `CLAUDE.md` is the working reference once code exists.

---

## 0. What the two apps are today (diff summary)

Diffing `app/`, `lib/`, `db/`, `middleware.ts`, `next.config.ts`:

| Identical (0-line diff) | Small drift | Divergent |
|---|---|---|
| `lib/db.ts`, `lib/login-codes.ts`, `DueChip`, `Pagination`, `SubmitButton`, `PaymentCheckboxes`, `RemindersSection`, `loading.tsx` files, `cal.ics/route.ts` | `middleware.ts` (demo + matcher), `session.ts` (cookie name), `mail.ts` (from name), `reminders.ts` (owner join), cron route (thanks flush), login actions (welcome redirect) | `schema.sql`, `lib/bills.ts` (owners, splitters, `getOwedPairs`, demo branches), `lib/emails.ts` (two shells), `globals.css` (two themes), `portal/actions.ts`, `page.tsx`, `layout.tsx`, `Nav.tsx` |

**utilities-only:** rent config + iCal RRULE, trends (Chart.js, hardcoded Gas/Electric), bulk
email tab, documents (client-direct Blob upload, 25 MB), thank-you receipt queue
(`payment_thanks`, debounced 10 min), public `/api/unpaid` (API key + HMAC), PDF required on
every bill (server action, 4 MB, deterministic `{year}/{type}/{MMDD}.pdf` key).

**peach-cob-only:** `bill_types.owner_id`, `bills.added_by_id`, `people.splits_bills`,
`people.welcomed_at` + `/welcome` tour, `getOwedPairs` ledger, `APP_DEMO_MODE` + `lib/demo.ts`,
auto-stamped `bill_date`, no PDF upload, `opengraph-image`/`apple-icon` via `next/og`,
Fraunces/Karla/Courier Prime + the awning.

**Both:** mysql2 on TiDB (no FKs, `dateStrings` + `decimalNumbers`), jose 30-day sliding
cookie keyed by email, 6-digit email codes (sha256, 10 min, 5 attempts, burst dedupe),
passphrase fallback, `APP_LOCAL_DEV_USER`, nodemailer over iCloud SMTP, Vercel Blob keys ==
stored path served by `/files/[...path]` with an extension allowlist, hourly GitHub Actions
ping into `/api/cron/reminders` with a NY send hour and a once-per-day guard.

Live data (read 2026-10-06): utilities has 2 people (Aaron admin, Riley), 4 types (Gas,
Electric with a $3.50 fee, Internet, Phone), 13 bills 2026-06-23..2026-10-01 all with PDFs,
3 documents (2.4 MB). Peach-cob's size is unknown from this machine (its TiDB credentials live
only in that Vercel project).

---

## 1. Conflicts and how they were resolved

Decided with Aaron:

| Conflict | Decision |
|---|---|
| Add-bill form (utilities asks statement date + requires PDF; peach-cob auto-stamps date, no PDF) | Household setting `ask_bill_date` (column default `false`; the onboarding wizard sets it, on for single-payer and off for ledger, and settings can change it). PDF always optional; when present it is keyed by bill date as utilities does. |
| Member rights (utilities: one admin; peach-cob: everyone admin so owners can post) | `admin` does everything. `member` reads everything and, for bill types they **own**, can post bills and mark payments. |
| Demo mode | `APP_DEMO_MODE` is gone. A hosted `/demo` on lejer.app shows the app without an account. |
| Next.js version | 16 (`proxy.ts`, Turbopack). |

Decided here; override by editing this table:

| Topic | utilities | peach-cob | Lejer |
|---|---|---|---|
| Payer's own share | payer gets a debt row and checks themself off | owner never gets a row | Owner-based everywhere: the payer gets no row. The import drops Aaron's self-debt rows, synthesizes paid rows for debtors the old data no longer has (§11), and reports the counts. |
| Split denominator | all people | `splits_bills = 1` | Splitters. The owner counts in the denominator but gets no debt. |
| "Admin" | one admin | all residents | `memberships.role` in (`admin`, `member`). Peach-cob imports with its current admin flags. |
| Thank-you receipts | yes | no | Feature toggle `feature_thanks`, default on. |
| Confirmation copies (`APP_CONFIRMATION_EMAIL_TO`) | global env | global env | Per-household optional `digest_email`, default empty. Every copy spends Resend's daily budget. |
| Email voice | "Hello", "View statement", "she already covered" | "Hi", "Open the ledger" | One neutral voice (they/them). The noun ("statement" vs "ledger") follows the theme. |
| Dark mode | follows system | none, deliberately | Per theme: statement offers `system`/`light`; peach is light-only. |
| Trends | hardcoded Gas/Electric | absent | All bill types with legend toggles, behind `feature_trends`. |
| Rent + calendar | `rent_config` + iCal RRULE | absent | Columns on `households`, behind `feature_rent`. |
| Public `/api/unpaid` | yes | no | Dropped. A per-household token could return later. |
| Passphrase login | yes | yes | Dropped. |
| `APP_LOCAL_DEV_USER` | yes | yes | `APP_DEV_USER` + `APP_DEV_HOUSEHOLD`, honored only when `VERCEL_ENV !== "production"`. |
| Session cookie | `utilities_session` {email} | `peachcob_session` {email} | `lejer_session` {uid, hid}. |
| Timezone | hardcoded NY | hardcoded NY | `households.timezone` (IANA). |
| Login-code subject | "Perk Utilities login code" | "Peach Cob sign-in code" | Lejer-branded. The household is unknown at login. |
| Footer phone number | yes | no | Dropped. |

---

## 2. Postgres port

### Driver and query layer

**postgres.js** (`postgres` on npm) over TCP to Neon's pooled endpoint, Node runtime only (the
Edge runtime is deprecated and we need interactive transactions anyway).

Why not `@neondatabase/serverless`: its HTTP mode is one statement per request, and every
tenant request here is a transaction (`set_config` + queries, see §4). Once everything is a
transaction, postgres.js is simpler: `sql.begin()`, tagged templates that read like today's raw
SQL, and per-type parsers.

```ts
// lib/db.ts
import postgres from "postgres";

export const sql = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
  prepare: false,          // PgBouncer transaction mode (Neon pooler) cannot hold prepared statements
  max: 3,                  // Fluid Compute reuses the instance; keep the pool tiny
  idle_timeout: 20,
  types: {
    date:    { to: 1082, from: [1082], serialize: (s: string) => s, parse: (s: string) => s },
    numeric: { to: 1700, from: [1700], serialize: String, parse: Number },
    int8:    { to: 20,   from: [20],   serialize: String, parse: Number },
  },
});
```

- `DATE` stays `YYYY-MM-DD` (replaces `dateStrings`). No `Date` objects for bill/due dates.
- `NUMERIC(10,2)` parses to `number` (replaces `decimalNumbers`). Money math stays
  `Math.round(x * 100) / 100` as today.
- `COUNT(*)` is `int8`; parse to `number` (our counts never exceed 2^53).
- `TIMESTAMPTZ` stays a JS `Date`; format at the edge.

**Raw SQL, no ORM.** Ten tables, every query already hand-aliases `snake_case AS camelCase`,
and row-level security needs a `set_config` call per transaction either way. Drizzle would add
a schema DSL and a migration tool for little gain at this size; revisit if the schema grows.
Migrations are numbered SQL files in `db/migrations/` applied by `scripts/migrate.ts`
(records applied files in `schema_migrations`), run with the owner connection.

### DDL mapping

| MySQL/TiDB | Postgres |
|---|---|
| `INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY` | `INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY` |
| `TINYINT(1)` | `BOOLEAN` |
| `DATETIME` (UTC by convention) | `TIMESTAMPTZ` |
| `DECIMAL(10,2)` | `NUMERIC(10,2)` |
| `ENUM('unpaid','paid')` | `TEXT NOT NULL CHECK (status IN ('unpaid','paid'))` — same for `mode`, `theme`, `role`, `color_scheme`. A CHECK is one `ALTER` to extend; a `CREATE TYPE` enum is not. |
| `VARCHAR(254) UNIQUE` email | `CITEXT UNIQUE` (`CREATE EXTENSION citext`) so `LOWER(email) = ?` goes away |
| `UTC_TIMESTAMP()` | `now()` |
| `... + INTERVAL 10 MINUTE` | `... + interval '10 minutes'` |
| `ON DUPLICATE KEY UPDATE` | `ON CONFLICT (...) DO UPDATE` |
| `LAST_INSERT_ID()` / `result.insertId` | `INSERT ... RETURNING id` |
| `DATE_FORMAT(d, '%Y-%m')` | `to_char(d, 'YYYY-MM')` |
| `SUM(cond)` in MySQL | `COUNT(*) FILTER (WHERE cond)` |
| `LIMIT ${n} OFFSET ${m}` interpolated | `LIMIT ${n} OFFSET ${m}` as bound params |
| `IN (${placeholders})` | `= ANY(${ids})` |
| No FKs | Real FKs, below |

### Foreign keys and ON DELETE

| FK | ON DELETE | Replaces |
|---|---|---|
| `memberships.user_id → users` | CASCADE | — |
| `memberships.household_id → households` | CASCADE | — |
| `bill_types.owner_id → memberships` | SET NULL | `removePerson` nulling `owner_id`; UI warns in single-payer mode |
| `bills.type_id → bill_types` | RESTRICT | `removeBillType` refusing while bills exist (keep the friendly check in the action too) |
| `bills.added_by_id → memberships` | SET NULL | `LEFT JOIN people pa` |
| `bills.owner_id → memberships` (0004) | SET NULL | — (the old apps read the type's current owner) |
| `bill_debts.bill_id → bills` | CASCADE | — |
| `bill_debts.person_id → memberships` | CASCADE | `removePerson` deleting debts |
| `payment_thanks.*` | CASCADE | `removePerson` deleting thanks |
| `documents.uploaded_by → memberships` | SET NULL | `LEFT JOIN people` so a document outlives its uploader |
| `login_codes.user_id → users` | CASCADE | — |
| `documents.household_id`, `bill_types.household_id`, … `→ households` | CASCADE | deleting a household removes everything |

The SET NULL FKs above are composite too (next paragraph), so they name the column to null —
`ON DELETE SET NULL (owner_id)` (Postgres 15+) — or Postgres would also null the `NOT NULL`
`household_id`.

Child tables carry a denormalized `household_id` with **composite FKs** so RLS never needs a
join and a child can never point across tenants:

```sql
ALTER TABLE bills ADD UNIQUE (id, household_id);
ALTER TABLE bill_debts
  ADD FOREIGN KEY (bill_id, household_id) REFERENCES bills (id, household_id) ON DELETE CASCADE,
  ADD FOREIGN KEY (person_id, household_id) REFERENCES memberships (id, household_id) ON DELETE CASCADE;
```

---

## 3. Data model: one model, two modes

```
households      id, slug UNIQUE, name, tagline,
                mode            TEXT CHECK IN ('single_payer','ledger'),
                theme           TEXT CHECK IN ('statement','peach'),
                color_scheme    TEXT CHECK IN ('system','light'),
                timezone        TEXT (IANA, default 'America/New_York'),
                ask_bill_date   BOOLEAN DEFAULT false, bills_per_page INT DEFAULT 10,
                feature_rent, feature_trends, feature_bulk_email, feature_documents,
                feature_welcome_tour, feature_thanks   BOOLEAN,
                monthly_rent NUMERIC(10,2) NULL, lease_start DATE NULL, lease_end DATE NULL,
                reminders_enabled BOOLEAN, send_hour SMALLINT, first_reminder_days SMALLINT,
                urgent_reminder_days SMALLINT,
                last_run_at TIMESTAMPTZ, last_send_date DATE, last_sent_at TIMESTAMPTZ, last_sent_count INT,
                from_name TEXT NULL, reply_to CITEXT NULL, digest_email CITEXT NULL,
                created_at TIMESTAMPTZ
users           id, email CITEXT UNIQUE, name, created_at                           -- global, no household
memberships     id, household_id, user_id, role TEXT CHECK IN ('admin','member'),
                splits_bills BOOLEAN, welcomed_at TIMESTAMPTZ NULL,
                invited_by INT NULL → memberships, invited_at, joined_at TIMESTAMPTZ NULL,
                calendar_token TEXT NOT NULL UNIQUE (32 random bytes, base64url, column default),
                UNIQUE (household_id, user_id), UNIQUE (id, household_id)
bill_types      id, household_id, name, emoji, processing_fee NUMERIC(10,2), owner_id → memberships NULL,
                UNIQUE (household_id, name), UNIQUE (id, household_id)
bills           id, household_id, type_id, bill_date DATE, due_date DATE, total, per_person_cost,
                status, pdf_path TEXT NULL, added_by_id NULL,
                owner_id NULL → memberships, had_owner BOOLEAN       -- snapshotted at post time (0004)
                UNIQUE (id, household_id)
bill_debts      household_id, bill_id, person_id, paid_at TIMESTAMPTZ NULL,  PRIMARY KEY (bill_id, person_id)
                                                                     -- permanent rows (0003)
payment_thanks  household_id, bill_id, person_id, queued_at, PRIMARY KEY (bill_id, person_id)
documents       id, household_id, title, category, file_path, content_type, file_size, uploaded_at, uploaded_by NULL
login_codes     id, user_id, code_hash CHAR(64), attempts SMALLINT, ip_hash CHAR(64) NULL,
                created_at, expires_at                                              -- no household
email_log       id, household_id NULL, kind TEXT, to_hash CHAR(64), ok BOOLEAN, sent_at TIMESTAMPTZ
                                                                                     -- daily budget + readouts
schema_migrations filename, applied_at
```

`rent_config` and `reminder_config` (single-row tables) fold into `households` columns.
`people` splits into global `users` (login identity) and per-household `memberships` (role,
`splits_bills`, `welcomed_at`). Display name lives on `users`: one person, one name.

### Mode semantics

Both modes run on **owner-based splits**. `households.mode` is a setting that drives defaults
and simplifies the UI; it never changes how debts are stored.

- **single_payer** = every `bill_types.owner_id` is the same membership (the payer). New types
  default to the payer; the type form hides the owner column; the dashboard shows "You owe $X"
  and the house ledger collapses to one creditor; add-bill flash copy says "split with the
  house". The onboarding wizard turns `ask_bill_date` on.
- **ledger** = types carry their own owners. Owner column shown; dashboard shows who-owes-whom
  pairs (`getOwedPairs`); new-bill emails tell debtors who to pay and the owner who owes them.
  The wizard leaves `ask_bill_date` off (the column default, `false`).
- **Switching** is a settings change. `ledger → single_payer` asks "who pays?" and bulk-sets
  every type's owner to that membership. `single_payer → ledger` just reveals the owner column.
  Existing bills and debts are untouched in both directions. No migration.

### Split math (unchanged from peach-cob, which generalizes utilities)

`total = amount + processing_fee`, `per_person_cost = round(total / splitters, 2)` where
splitters = memberships with `splits_bills` true (owner included; pending invites too). Debt
rows for every splitter **except** the owner. Non-splitters (the maintainer pattern) sign in,
see everything, never owe, never get emails. Money math is done in cents.

### Each bill keeps its owner (0004, decided 2026-10-06)

A bill's creditor used to be its type's *current* owner, so handing Gas from one roommate to
another moved every old unpaid Gas bill to the new owner (who might even be a debtor on it).
Posting now snapshots the type's owner into `bills.owner_id` (composite FK with `household_id`,
`ON DELETE SET NULL (owner_id)`), plus `had_owner`. The type's owner only decides who owns new
bills. The ledger, balances, reminder Reply-To and "may manage this bill" all read the bill's
owner, so the old owner keeps managing (and being owed on) their old bills after a reassignment.
When an owner's membership is removed, `owner_id` goes NULL and `had_owner` keeps the bill
reading as "former member" (only an admin can manage it then); a bill posted for a type with
no owner has `had_owner = false` and is owed to "the house". Existing rows were backfilled
from their type's owner when 0004 ran.

### Debt rows are permanent (0003, decided 2026-10-06)

Both source apps deleted a `bill_debts` row when someone paid, so the original debtor set was
lost; unchecking a payment had to rebuild debts from *today's* splitters, which re-added the
wrong people (anyone who joined after the bill). Lejer keeps the rows:

- The row set is written once, when the bill is posted (`createBill`), and never rebuilt.
- Paying sets `paid_at = now()`; un-paying sets it `NULL` (`setPaid`, one row at a time,
  transactional). Unchecking therefore restores exactly the original debtor, and someone who
  joined later can never gain a row on an old bill.
- A bill is `paid` exactly when none of its rows has `paid_at IS NULL`. `bills.status` is kept
  in step in the same transaction (`refreshBillStatus`), including when removing a member
  cascades their rows away.
- Balances, the owed-pairs ledger and reminders all read `paid_at IS NULL`.
- Not chosen: comparing `memberships.invited_at` to the bill's date to decide eligibility.
  Imported memberships get `invited_at` = import time, after every historical bill, so nobody
  could ever be re-added on old bills.

---

## 4. Tenancy

### Central scoping helper

Nothing queries outside a household transaction. `lib/context.ts` resolves the request once
(React `cache()`), replacing `getCurrentPerson()`:

```ts
export interface Ctx { user: User; membership: Membership; household: Household; demo: boolean }
export const getCtx = cache(async (): Promise<Ctx | null> => { /* session → ctx, dev bypass, demo */ });
```

`lib/db.ts` exposes the only sanctioned way to run tenant SQL:

```ts
export async function withHousehold<T>(ctx: Ctx, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.household_id', ${String(ctx.household.id)}, true),
                    set_config('app.user_id',      ${String(ctx.user.id)},      true)`;
    return fn(tx);
  });
}
```

Every function in `lib/bills.ts`, `lib/reminders.ts`, etc. takes `tx` as its first argument;
pages open one `withHousehold` per request and pass `tx` down. `sql` itself is not exported to
app code — only `withHousehold`, `withUser` (login-time queries on `users`/`login_codes`), and
`adminSql` (owner role, §4 "roles").

### Row-level security (second lock)

Every household table: `ENABLE ROW LEVEL SECURITY`, deliberately **not** `FORCE`. `FORCE` exists
only to subject the table owner to policies, and we want the owner (`neondb_owner`, the
migration role) exempt; plain `ENABLE` gives exactly that while `lejer_app` stays enforced.
Policies read the transaction-local GUCs. After a `SET LOCAL` transaction ends on a pooled connection the
GUC is the empty string, not NULL, and `''::int` throws, so every policy goes through `NULLIF`:

```sql
CREATE FUNCTION app_household_id() RETURNS int LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.household_id', true), '')::int $$;
CREATE FUNCTION app_user_id() RETURNS int LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.user_id', true), '')::int $$;

-- Tenant tables (bills, bill_types, bill_debts, payment_thanks, documents, email_log):
CREATE POLICY tenant ON bills
  USING (household_id = app_household_id())
  WITH CHECK (household_id = app_household_id());

-- memberships: readable for my current household OR any row that is mine (the switcher);
-- writable only inside the current household.
CREATE POLICY memberships_read ON memberships FOR SELECT
  USING (household_id = app_household_id() OR user_id = app_user_id());
CREATE POLICY memberships_write ON memberships FOR ALL
  USING (household_id = app_household_id())
  WITH CHECK (household_id = app_household_id());

-- households: readable if current OR I am a member (names for the switcher);
-- writable only when current.
CREATE POLICY households_read ON households FOR SELECT
  USING (id = app_household_id()
         OR id IN (SELECT household_id FROM memberships WHERE user_id = app_user_id()));
CREATE POLICY households_write ON households FOR ALL
  USING (id = app_household_id())
  WITH CHECK (id = app_household_id());

-- email_log: login codes are sent before any household exists, so inserts accept NULL;
-- reads stay household-only (portal readouts); no UPDATE/DELETE policy (append-only).
CREATE POLICY email_log_read ON email_log FOR SELECT
  USING (household_id = app_household_id());
CREATE POLICY email_log_insert ON email_log FOR INSERT
  WITH CHECK (household_id IS NULL OR household_id = app_household_id());

-- Account-wide counts (Resend's cap is per account) for the cron budget and the login-code
-- cap. Runs as the owner, returns a number and nothing else.
CREATE FUNCTION email_sends_since(since timestamptz, only_kind text DEFAULT NULL) RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT count(*)::int FROM email_log
     WHERE sent_at >= since AND (only_kind IS NULL OR kind = only_kind) $$;
REVOKE EXECUTE ON FUNCTION email_sends_since(timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_sends_since(timestamptz, text) TO lejer_app;
```

The calendar feed (`/cal.ics?k=<token>`) is fetched by calendar apps with no session, so it
needs one more definer function, hardened the same way. Tokens are per **membership**, not
per household: removing a member kills their feed by cascade, and "reset my calendar link"
(`UPDATE memberships SET calendar_token = DEFAULT` for `ctx.membership.id`) rotates one
person's link without touching anyone else's.

```sql
-- 0002 (CREATE EXTENSION pgcrypto for gen_random_bytes; available on Neon PG 17):
-- memberships.calendar_token TEXT NOT NULL UNIQUE
--   DEFAULT rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=')
CREATE FUNCTION calendar_context(token text)
  RETURNS TABLE (household_id int, membership_id int)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT m.household_id, m.id FROM memberships m WHERE m.calendar_token = token $$;
REVOKE EXECUTE ON FUNCTION calendar_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calendar_context(text) TO lejer_app;
```

The route calls it inside `withUser(null)`, then serves the feed inside `withHousehold` for the
returned household. `memberships_read` lets a member see everyone's row in their household,
tokens included; app code selects `calendar_token` only for `ctx.membership.id`.

A plain tenant policy on `email_log` would have broken three things: login-code sends
(`household_id NULL`) could not be logged, the global login-code cap could not see any rows,
and the cron budget would count only its own household's sends. Because `RETURNING` must pass
the SELECT policy, `INSERT … RETURNING` of a NULL-household row fails: `sendMail` does not use
`RETURNING`.

Note: with `FOR ALL` plus a more permissive `FOR SELECT` policy, Postgres ORs permissive
policies per command, so reads use the union and writes use only the household branch, which is
the intent. A missing GUC yields NULL on both sides → zero rows, zero writes (fail closed).

`users` and `login_codes` have no RLS: login happens before any household is known, and those
queries are keyed by the email being verified. `withUser` sets only `app.user_id`.

### Roles on Neon

- `neondb_owner` (Neon's default): owns the tables, so RLS (enabled, not forced) does not apply
  to it. (It also has `rolbypassrls = true` on Neon; either is sufficient.) It can also
  disable RLS outright, so the app does not run as this role. Its URL is
  `DATABASE_URL_ADMIN` (unpooled). Allowed call sites, enumerated in `CLAUDE.md`:
  1. `scripts/migrate.ts`
  2. `scripts/import-tidb.ts`
  3. `createHousehold()` (signup: insert household + first admin membership, then return)
  4. the cron tick's household enumeration (`SELECT id, timezone, … FROM households`)
- `lejer_app`: created **with SQL** as `neondb_owner` on `main` before branching
  (`CREATE ROLE lejer_app LOGIN PASSWORD … NOBYPASSRLS`), not in the console, so it is not a
  member of `neon_superuser`. `0001_init.sql` refuses to run without it, then grants
  `USAGE ON SCHEMA public`, `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`,
  `USAGE ON ALL SEQUENCES`, `ALTER DEFAULT PRIVILEGES` so future tables inherit, and revokes
  `schema_migrations`. Its pooled URL is `DATABASE_URL`.

### Neon connection pooling and RLS

Neon's `-pooler` endpoint is PgBouncer in **transaction mode**: a connection is handed to a
client for one transaction and the next transaction may run on a different server connection.
Consequences baked into the design:

- Session-level `SET` is useless and dangerous (it can leak onto another tenant's transaction).
  Only `set_config(name, value, true)` / `SET LOCAL` inside `BEGIN … COMMIT`.
- `prepare: false` is mandatory; PgBouncer transaction mode cannot track prepared statements.
- Transactions are short: one per request, no awaiting user input inside.
- `LISTEN/NOTIFY`, advisory locks that outlive a transaction, and temp tables are off the table.

### Blob keys and `/files`

Private Blob stores, one per environment class: `lejer-blob` for development and preview,
a separate store for production, created at cutover (decided 2026-10-06; household ids come
from different databases per environment, so a shared store would collide on `h/{id}/`).
Verified against current docs: `@vercel/blob` ≥ 2.3,
`put(path, body, { access: 'private' })`, server-side `get()` returns a stream, store access
mode is fixed at creation). Private means blob URLs are not fetchable without a token, so
`/files` is the only way in and the "public but unguessable URL" argument is retired.

Keys are household-prefixed:

```
h/{household_id}/bills/{year}/{type-slug}/{MMDD}-{billId}.pdf   deterministic per bill; allowOverwrite: true
h/{household_id}/documents/{slug}-{randomSuffix}.{ext} addRandomSuffix: true
```

`/files/[...path]/route.ts`:

1. `getCtx()` or 403.
2. Reject unless the key starts with `h/${ctx.household.id}/` (cheap first lock).
3. Inside `withHousehold`, confirm the key exists in `bills.pdf_path` or
   `documents.file_path` (RLS is the second lock: a key from another household returns no row
   even if step 2 were wrong).
4. Extension allowlist (pdf/png/jpg/jpeg/heic/heif, no SVG), `X-Content-Type-Options: nosniff`,
   `Content-Disposition: inline`, `Cache-Control: private, max-age=3600`.
5. `get(key, { access: 'private' })` and stream the body.

The bill id in the key (revised 2026-10-06) keeps two same-type bills posted the same day
apart; with `ask_bill_date` off every bill is dated today, so `{MMDD}` alone would collide.
The type is slugified. The `pdf_path` CHECK pins only the `h/{id}/bills/` prefix, so it needed
no change. `addBill` reserves the bill id (`nextval`) first, uploads under the final key, then
inserts the row, so a bill never points at a missing file.

Bill PDFs upload through the add-bill server action (`experimental.serverActions.bodySizeLimit`
4.4 MB; the action caps the file at 4 MB and checks the `%PDF-` magic bytes; under Vercel's
4.5 MB request cap). Documents upload client-direct via `handleUpload` in `/api/documents/upload`;
`onBeforeGenerateToken` runs `requireAdminAction()` and **refuses** any pathname outside
`h/{id}/documents/` (revised 2026-10-06: `@vercel/blob` binds the client token to the pathname
the browser requested and offers no way to substitute another, so the original plan to rewrite
it was impossible; the page tells the browser its prefix, and the bound token means the upload
cannot land anywhere else); `onUploadCompleted` stays a no-op
(never fires against localhost) and `addDocument()` `head()`s the key before inserting. That
route stays excluded from `proxy.ts` for the same callback reason as today; the OIDC token is
preferred on Vercel, `BLOB_READ_WRITE_TOKEN` is still needed for client-upload token minting
and for the import script.

---

## 5. Identity

- **One email, many households.** `users` is global; `memberships` is per household. Nav shows
  the household name; a switcher appears only when a user has more than one membership.
- **Login** stays email-code: enter email → 6-digit code (sha256 at rest, 10 min TTL, 5 wrong
  guesses kill it, 30 s burst dedupe) → `lejer_session` JWT `{ uid, hid }`, 30 days, re-issued
  by `proxy.ts` once a week old. `hid` is validated against `memberships` on every request in
  `getCtx()`; a stale or revoked `hid` falls back to the user's first membership or `/households`.
- **Unknown email is not an error anymore.** Anyone can sign up, so the code is sent regardless
  (this also stops login from enumerating members). `login_codes` is keyed by the normalized
  email (citext; `0002` replaced `user_id`, revised 2026-10-06 because a NOT NULL `user_id`
  would have forced a `users` row per code request), so requesting a code writes nothing to
  `users`. Verifying the code creates the `users` row with a placeholder name from the email's
  local part and lands on onboarding, whose first field asks for the real name.
- **Signup = onboarding** after first login: your name, household name, mode (two cards with
  one-line explanations), theme, timezone → `createHousehold()` (owner role, one transaction: household +
  admin membership) → "invite your roommates".
- **Invites by email.** An admin enters name + email (+ role, `splits_bills`). This upserts the
  `users` row (name only if new) and inserts a `memberships` row with `joined_at NULL`. Resend
  sends "{Admin} added you to {Household} on Lejer" with a `/login?email=` link. The email-code
  login already proves ownership of the address, so there is no invite-token table; signing in
  stamps `joined_at` (and so does opening the household from the switcher). "Resend invite"
  re-sends the email. Removing a membership cascades debts and thanks, nulls
  owner/uploader/poster references (same outcome as `removePerson` today). Unlike login,
  invites do create the `users` row up front: an admin vouched for the address.
- **Names belong to their owner.** `users.name` is shared by every household a person is in,
  so admins set it only when inviting someone new to Lejer; afterwards the person edits it on
  `/account`. Admins manage role and `splits_bills`. The last joined admin can't be demoted;
  nobody removes themselves.
- **Roles.** `admin`: settings, members, bill types, every bill, bulk email, documents CRUD.
  `member`: read everything; in ledger mode, post bills and mark payments for types they own.
  Helpers: `requireUser()`, `requireAdmin()`, `requireAdminAction()` keep their names;
  `requireBillManager(tx, typeId)` = admin or owner of that type.
- **Non-splitting members** keep `splits_bills = false`: visible, can sign in, excluded from
  split math, debts, checkbox lists and new-bill emails (`getSplitters()`).
- **Login-code abuse controls** (new; the app is public now):
  - per email: 5 codes per 10 min window, 30 s burst dedupe (as today);
  - per IP: 10 codes per hour (`login_codes.ip_hash` = sha256 of the client IP from
    `x-forwarded-for`'s first hop, never the raw IP);
  - global: 40 code emails per UTC day, counted from `email_log` via `email_sends_since()`; past that the form says
    "try again later" and logs. This reserves ~60% of Resend's 100/day for household mail.
- **Dev bypass.** `APP_DEV_USER=<email>` + `APP_DEV_HOUSEHOLD=<slug>`; `getCtx()` resolves both
  and `proxy.ts` short-circuits, **only** when `VERCEL_ENV !== "production"` (local and preview
  deployments). The passphrase fallback and `SITE_OWNER_EMAIL` are deleted.
- **Demo.** `GET /demo` sets a separate signed `lejer_demo` cookie `{ demo: true }` (its own JWT
  audience), which `getCtx()` consults only when there is no real session. It returns an
  in-memory ledger-mode household (ported `lib/demo.ts`, relative dates, neutral names); data
  functions branch on `ctx.demo` and mutations return the polite refusal; theme switching works
  so it doubles as a theme preview. No env flag. A signed-in user hitting `/demo` sees "You're
  signed in to <household>. Sign out to view the demo, or go back." and is never silently
  redirected into their own household.

---

## 6. Email

- **Resend** replaces nodemailer. The account is set up directly at resend.com (not the
  Vercel marketplace); Aaron owns the `RESEND_API_KEY` and the DNS. Domain `mail.lejer.app`
  verified (SPF + DKIM on the subdomain; a DMARC record on `lejer.app`). Development does not
  wait on verification: until it lands, dev sends from Resend's test sender
  (`onboarding@resend.dev`, which delivers only to the account owner's address), and the
  seed users sign in through the dev bypass. With `RESEND_API_KEY` empty outside production,
  `sendMail()` prints each message with a `[mail:console]` prefix and writes no `email_log` row;
  production refuses to boot without the key (`instrumentation.ts`), so codes never reach logs. Senders: `login@mail.lejer.app` for codes and
  invites (From "Lejer", no Reply-To) and `notify@mail.lejer.app` for everything household-scoped.
- **Per-household From and Reply-To.** From is
  `"{households.from_name ?? households.name} via Lejer" <notify@mail.lejer.app>`; the display
  name is where the household identity lives since the address must stay on our domain.
  Reply-To defaults to `households.reply_to` (seeded with the creating admin's email). Reminder
  and new-bill emails override Reply-To with the **bill owner's** email so "reply to settle up"
  reaches the person being paid.
- **React Email** (`@react-email/components` + `render`): templates are components, previewed
  with `npm run email:dev`. A `<Shell theme>` carries the two existing shells (statement: mono
  eyebrows, ruled tables, grey page; peach: awning stripe masthead, Georgia, Courier) chosen by
  `households.theme`, same inline-style, light-only, 560 px discipline as today. Templates:
  login code (+ plain-text alternative), invite, new bill (owner-aware: debtors told who to pay,
  owner told who owes), reminder (heads-up/urgent), payment thanks (multi-bill), custom note,
  reminder batch confirmation, bulk-email receipt, and a digest copy (what a new-bill notice or
  a per-bill reminder told whom) for `digest_email`. Copy is gender-neutral.
- `sendMail()` returns `false` on failure (logged, never thrown) as today, and writes an
  `email_log` row either way. Reminder batches use `resend.batch.send` (≤ 100 per call),
  replacing the 1 s SMTP sleep.
- **Daily budget.** `email_log` is the source of truth for "sends today" (UTC), read
  account-wide through `email_sends_since()` (§4). Before a
  household's reminder batch, the cron computes `sentToday + batchSize`; if it would exceed
  **80**, it defers that household (no `last_send_date` stamp, so the next hour retries; if the
  day never clears, tomorrow's window sends), logs `deferred: budget` in the tick response, and
  continues with the next household. Login codes, invites and thanks are never deferred.
- **Bulk email has a lower ceiling (decided 2026-10-07).** It is optional and reminders aren't, so
  `/portal/email` refuses when today's account-wide sends plus its recipients (and the receipt)
  would pass **60**, leaving headroom for the reminder batch and login codes. The refusal names
  the next UTC midnight in the household's timezone as the time to try again.
- **Digest copies.** When `digest_email` is set it gets the batch confirmation, the bulk-email
  receipt, and a copy for each new bill and each per-bill reminder. Every copy is one more send
  against the budget, which is why it defaults to empty.

---

## 7. Per-household settings (`/portal/settings`)

| Group | Settings |
|---|---|
| Household | name, tagline (shown in nav and email masthead), slug (read-only after creation), **mode** switch (§3) |
| Features | `feature_rent` (rent + calendar), `feature_trends`, `feature_bulk_email`, `feature_documents`, `feature_welcome_tour`, `feature_thanks` |
| Look | `theme` (statement / peach, with preview), `color_scheme` (statement: system / light; peach: light only) |
| Bills | `ask_bill_date`, `bills_per_page` |
| Reminders | `reminders_enabled`, `send_hour` (in the household's timezone), `first_reminder_days`, `urgent_reminder_days`, read-only "last tick / last send" from the cron columns |
| Time | `timezone` (IANA select; also drives `bill_date` auto-stamping and day math) |
| Email | `from_name`, `reply_to`, `digest_email` |
| Rent | `monthly_rent`, `lease_start`, `lease_end` (shown when `feature_rent`) |

Disabled features disappear from nav, footer, the portal tabs and the iCal feed. Themes are
`<html data-theme="peach">` with per-theme token blocks in `globals.css` (`:root` = statement;
`[data-theme="peach"]` overrides). The statement dark block is gated on
`[data-color-scheme="system"]`. All four faces (IBM Plex Mono, Fraunces, Karla, Courier Prime)
load via `next/font` with `preload: false` on the non-default theme's fonts so a household only
downloads what its theme uses.

---

## 8. Cron

**One endpoint** `GET /api/cron/tick`, bearer `CRON_SECRET` (timing-safe compare; 500 when the
server has no secret, 401 for a missing or wrong header), `maxDuration = 120`:

1. Owner-role query: `SELECT id … FROM households` (the enumeration call site).
2. For each household, with a system scope (`user: null`) and **short** transactions only (reads
   and stamps, never a send inside one, per the pooling rules):
   - stamp `last_run_at`;
   - flush the thanks queue if `feature_thanks` (own 10-minute debounce, every tick; payment
     edits also flush through `after()`, as utilities did, so a receipt doesn't wait for the
     next tick);
   - compute local hour and date with `localHour(tz)` / `localDate(tz)`;
   - if `reminders_enabled && hour >= send_hour`, **claim the day**:
     `UPDATE households SET last_send_date = today WHERE id = … AND (last_send_date IS NULL OR
     last_send_date < today) RETURNING` the previous value. No row back means another tick (or an
     earlier, later-timezone day) already has it. `<` rather than `!=` means a household that
     moves to a timezone where it is still yesterday can't send twice, and the atomic claim means
     curl's retry of a slow tick can't either (decided 2026-10-07);
   - with the day claimed, check the daily budget (§6) for the batch plus its confirmation copy.
     Over budget → **release** the claim and report `deferred: budget`;
   - send. If every send failed, **release** the claim. A release is a compare-and-set,
     `SET last_send_date = <previous> WHERE last_send_date = <the date this tick claimed>`, so a
     slow failing tick can never clobber a later tick's successful claim. Any success, or nothing
     due, keeps the stamp and records `last_sent_at` / `last_sent_count`.
3. Respond with a per-household summary (`sent`, `failed`, `skipped`, `deferred`); 500 only if
   every household that tried to send failed, so the Actions run goes red.

**What gets a reminder** (decided 2026-10-07). For each unpaid debt row (`paid_at IS NULL`) of a
joined member, with `days` = due date minus the household's today:
- `days = first_reminder_days`: the heads-up;
- `0 ≤ days ≤ urgent_reminder_days`: urgent, daily, up to and including the due date;
- overdue: urgent on overdue days 1, 4, 7, … (`OVERDUE_EVERY_DAYS = 3` in `lib/reminders.ts`, a
  constant, not a setting).
Utilities reminded daily forever once overdue. That contradicted the product principle "never
make someone feel nagged", so Lejer slows to every third day once a bill is late; the per-bill
button in the portal is still there for a nudge in between. A day with no tick at or after the
send hour skips that day's reminders (the heads-up included); GitHub dropping every run in a
local day is rare enough to accept.

**Scheduler.** Vercel Hobby crons are limited to **once per day** with ±59 min jitter, and
sub-daily expressions fail the deployment, so a portal-configurable send hour cannot ride Vercel
Cron. Keep the **GitHub Actions** hourly ping (`7 * * * *`, pinging `https://lejer.app/api/cron/tick`
with the repo secret). GitHub drops (does not queue) delayed scheduled runs, which the
"first tick at or after send_hour, once per local day" rule already tolerates. If dropped runs
become a nuisance, cron-job.org (free, minute-accurate) is a drop-in replacement; the endpoint
does not care who pings it. `scripts/send-reminders.ts` remains the manual CLI and takes
`--household <slug>`. It is the **fifth** owner-role call site (decided 2026-10-07): it uses
`adminSql` only to resolve the slug to an id, then runs the same per-household tick under a
system scope. It ignores `send_hour` but honors the day claim and the budget unless `--force`.

The workflow (`.github/workflows/tick.yml`) is committed **inactive**: its job runs only when the
repo variable `TICK_URL` is set, so cutover is setting `TICK_URL` and the `CRON_SECRET` secret,
with no code change and no domain spelled out in the repo.

---

## 9. Dropped or rethought

| Thing | Fate |
|---|---|
| `/api/unpaid` public JSON API (`API_KEY`, `HMAC_KEY`) | Dropped. If a widget needs it later, a per-household read token on `households` is the shape. |
| Passphrase login (`SITE_PASSPHRASE`, `SITE_OWNER_EMAIL`) | Dropped. Preview deployments use the dev bypass. |
| `APP_LOCAL_DEV_USER` | `APP_DEV_USER` + `APP_DEV_HOUSEHOLD`, gated on `VERCEL_ENV`. |
| `APP_DEMO_MODE` / per-deployment demo | Gone. `/demo` route on the real deployment. |
| `/email → /portal/email` 301 | Dropped. |
| iCloud SMTP vars, `APP_EMAIL_FROM_*`, `APP_CONFIRMATION_EMAIL_TO`, `APP_BASE_URL` | Replaced by `RESEND_API_KEY`, `households.from_name/reply_to/digest_email`, and `NEXT_PUBLIC_APP_URL`. |
| `rent_config`, `reminder_config` tables | Columns on `households`. |
| Footer phone number | Dropped; footer shows the household's `reply_to`. |

---

## 10. Free-tier limits (checked 2026-10)

| Service | Free limits | First thing we'd hit |
|---|---|---|
| **Vercel Hobby** | 4 h active CPU, 1 M invocations, 360 GB-h memory, 100 GB fast transfer / month; crons once per day; one seat; non-commercial use only | Cron frequency (solved by GitHub Actions). Compute is nowhere near; one Blob-backed PDF stream per view is the heaviest path. |
| **Neon Free** | 0.5 GB storage, 100 CU-hours / month, autosuspend after 5 min, up to 2 CU, 5 GB egress | **CU-hours** if anything pings more often than hourly: the hourly tick keeps compute awake ~5–6 min per hour at 0.25 CU ≈ 18 CU-h / month; interactive use adds little. Never schedule minute-level pings. Expect a 0.5–1 s cold start on the first request after idle. |
| **Vercel Blob (Hobby)** | 1 GB storage (pooled with other Hobby usage), modest operation counts; exceeding locks Blob for 30 days | Years away: ~300 KB per bill PDF → ~3,000 PDFs. Documents (25 MB cap each) are the only way to burn it quickly. |
| **Resend Free** | 3,000 / month, **100 / day**, 1 verified domain | **The daily cap.** A reminder morning across 5 households × 4 members × 3 due bills ≈ 60 emails, plus codes and thanks. Hence the 80-per-day cron budget and the 40-per-day login-code cap. |
| **GitHub Actions** | free for public repos; 2,000 min / month private | ~30 s × 720 runs ≈ 6 h / month, fine either way. |

---

## 11. Phased plan

Each phase ends with `npm run build` green (the typecheck gate, as in both source repos).

**Phase 1 — Scaffold and data layer.** `create-next-app` (Next 16, TypeScript, Tailwind v4,
App Router, Turbopack), `vercel.ts`, `.env.example`. Neon is created **directly** (`neonctl`,
org Aaron Perkel LLC, `aws-us-east-1`), not through the Vercel marketplace: the integration
owns `DATABASE_URL` and points it at the owner's pooled URL, which would run the app past RLS.
Blob (private store) via `vercel blob create-store` on the linked project; Resend directly at
resend.com (revised 2026-10-06, see §6); dev values live in Vercel's Development environment
for `vercel env pull`. `lib/db.ts`
(postgres.js, type parsers, `withHousehold`, `withUser`, `adminSql`), `db/migrations/0001_init.sql`
(schema, FKs, composite FKs, RLS functions and policies, roles and grants), `scripts/migrate.ts`,
`db/seed.sql` (one household per mode, two users). Placeholder page that renders a seeded
household through `withHousehold`.

**Phase 2 — Identity.** `proxy.ts` (session check, sliding renewal, dev bypass, exclusions),
`lib/session.ts`, `lib/login-codes.ts` (user_id, ip_hash, caps), `/login`, Resend client and the
login-code + invite templates with the `<Shell>`, onboarding wizard + `createHousehold()`,
members page with invites, roles helpers, `/households` switcher, `/demo`, `email_log`.
`db/migrations/0002_*.sql`: `memberships.calendar_token` + `calendar_context()` (§4) and
`ask_bill_date DEFAULT false`, plus the "reset my calendar link" action (the feed itself
ships in phase 5).

**Phase 3 — Core ledger.** `0003` (permanent debt rows, §3), bill types with owners
(mode-aware form), add bill (`ask_bill_date`, optional PDF → private Blob), payment checkboxes
(`setPaid`, thanks queue hooks), per-bill reminder, the new-bill and reminder templates (moved
up from phase 4 because phase 3 sends them), dashboard (mode-aware summary strip, owed pairs,
year groups), portal bills + household tabs, `/files`, documents (client-direct upload, list,
edit, remove). Port the zero-diff components (`DueChip`, `Pagination`, `SubmitButton`,
`PaymentCheckboxes`, loading skeletons). `RemindersSection` (the reminder schedule form) moves
to phase 4 with the settings it edits. Verify suites `bills` and `http`.

**Phase 4 — Email, reminders, cron.** Remaining templates (thanks, custom, batch confirmation,
bulk receipt, digest copy), `RemindersSection`, `lib/reminders.ts` per household with timezone, thanks
flush, bulk email tab, `/api/cron/tick` with the budget rule, `.github/workflows/tick.yml`,
`scripts/send-reminders.ts`, settings page groups for reminders, timezone and email (feature
toggles, look, bills and rent stay phase 5). Verify suite `cron`.

**Phase 5 — Features and themes.** Trends over all types (CSV too), rent + `/cal.ics?k=`
(per-membership token via `calendar_context()`; RRULE when `feature_rent`), welcome tour behind `feature_welcome_tour`, both theme token
blocks + dark mode for statement, OG and apple icons via `next/og`, the rest of the settings
page, nav/footer gating.

**Phase 6 — Import and cutover.**
Prerequisites: `vercel env pull` from the **peach-cob** Vercel project for its `DB_*` and
`BLOB_READ_WRITE_TOKEN` (not on this machine); utilities' are in `../utilities/.env.local`.
Put them in `.env.import.local` as `SRC_UTIL_DB_*`, `SRC_UTIL_BLOB_TOKEN`, `SRC_PC_DB_*`,
`SRC_PC_BLOB_TOKEN`.

`scripts/import-tidb.ts` (owner role, `DATABASE_URL_ADMIN`):
1. Read both TiDB databases with mysql2 (`dateStrings`, `decimalNumbers`), like
   `../utilities/scripts/migrate-to-tidb.ts`.
2. `users`: dedupe by lowercased email (Aaron appears in both → one user, two memberships).
3. Household **"77 N Union #3"** (`mode = single_payer`, theme statement, `color_scheme`
   system, `ask_bill_date` on, rent/trends/bulk/documents/thanks on, tour off): people →
   memberships with existing admin flags; all types owned by Aaron's membership; bills and
   debts copied **minus Aaron's own debt rows**; `rent_config` and `reminder_config` →
   household columns; documents copied.
4. Household **"404 Parke Ave"** (`mode = ledger`, theme peach, `ask_bill_date` off, tour and
   thanks on, rent/trends/bulk/documents off): people → memberships (everyone admin, Aaron
   `splits_bills = false`), `welcomed_at` carried, owners mapped, `added_by_id` mapped, debts
   copied as-is.
   **Bill owners, both households (0004):** each imported bill's `owner_id` is set from its
   type's owner **at import time** (`had_owner` accordingly). The old apps never recorded a
   per-bill owner, so for any type whose owner changed in the past, older bills get the
   current owner; there is no better record.
   **Debt rows, both households (0003):** the old apps deleted a row when someone paid, so the
   source data holds only *unpaid* rows. Copy those with `paid_at NULL`. Then, for every bill,
   **synthesize** a row for each splitter (as of import) who is not the type's owner and has
   no row: those people already paid. Their `paid_at` is the bill's `due_date` at 12:00 in the
   household's timezone. That timestamp is **synthetic** (the real payment time was never
   recorded) and should be read as "paid by around the due date", nothing more. Finally set
   every bill's `status` from its rows (`refreshBillStatus`), and print how many rows were
   copied, synthesized and dropped (self-debts) and how many bills flipped to `paid`.
5. Blobs: `list()` each old (public) store, fetch each blob, `put()` into the **production**
   private store (the import's `BLOB_READ_WRITE_TOKEN` must be the production store's, never
   lejer-blob's) under `h/{id}/…`, rewrite `pdf_path` / `file_path`. Idempotent (`allowOverwrite`).
6. Verification block per household: row counts, `SUM(total)`, unpaid count, unpaid debt
   rows (= source rows minus dropped self-debts), synthesized paid rows, blob count vs. rows with paths. Non-zero exit on
   mismatch. `--force` deletes the two households (cascades) and their blob prefixes first.
7. Cutover checklist:
   - **Create the production Blob store** (`vercel blob create-store <name> --access private
     --region iad1 -e production`): its own store, never lejer-blob, which stays dev/preview
     only. Confirm Production's `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` point at it and
     that lejer-blob is not connected to Production.
   - Set the remaining Production env vars (CLAUDE.md, Deployment), set or reset `lejer_app`'s
     password on `main`, run `npm run migrate` against `main`.
   - Dry-run the import against a Neon branch (with a throwaway store), then production.
   - DNS for lejer.app; disable both old GitHub Actions workflows; old domains redirect to
     lejer.app; TiDB left read-only for a month.

---

## 12. Open items to confirm during implementation

- ~~Neon role creation via SQL vs. the console.~~ SQL (§4 "Roles"): console roles join
  `neon_superuser`. Verified 2026-10-06: `lejer_app` `rolbypassrls = false`, not a member.
- Resend's daily counter boundary (UTC assumed). The budget rule is conservative either way.
- ~~Blob store shared across environments.~~ Decided 2026-10-06: `lejer-blob` is dev/preview
  only, permanently; production gets its own store at cutover (§11 step 7). `verify` pins
  lejer-blob by store id.
- `mail.lejer.app` domain verification at Resend (Aaron's DNS). Until then dev uses the test
  sender (§6); nothing in phase 2 blocks on it.
- ~~Whether `households_read`'s subquery needs a `SECURITY DEFINER` helper.~~ It does not.
  Verified 2026-10-06 on a Neon branch with a two-tenant probe (58 checks): fail-closed with
  no GUC (pooled and direct), `''` → NULL via `NULLIF` on a reused pooled backend, no
  cross-household reads/writes, composite FKs block cross-tenant children, 60 interleaved
  pooled transactions without leaks, switcher reads without recursion, owner unaffected.

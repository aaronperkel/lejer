# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lejer (lejer.app): a hosted, multi-tenant Next.js 16 (App Router) + TypeScript + Tailwind v4
app for splitting household bills. Households sign up, invite roommates by email, post bills,
track who owes whom, and get reminder emails. It merges two earlier single-household apps that
share a lineage — `../utilities` (77 N Union, one person pays everything) and `../peach-cob`
(404 Parke Ave, each bill type has an owner who fronts it). When behavior is ambiguous, those
repos are the ground truth for intent; `DESIGN.md` records every decision made in the merge,
including a table of places the two apps disagreed and which way Lejer went.

**One data model, two modes.** Every bill type has an `owner_id`; posting a bill snapshots it
into `bills.owner_id`, and debts on a bill run to **the bill's** owner (reassigning a type only
changes who owns new bills). `households.mode` is `single_payer` (every type owned by the same person; UI hides the
owner column, dashboard says "you owe") or `ledger` (types carry their own owners, dashboard
shows who-owes-whom). Mode is a setting that drives defaults and copy; switching never
migrates data.

**Brand.** "Lejer" / lejer.app is the working name and may change before launch. The name,
domain, app URL, mail subdomain and From addresses, and cookie names live in `lib/brand.ts`;
code and email templates read `BRAND` / `appUrl()` and never spell them out (the `brand`
verify suite fails on a stray literal). These docs keep saying "Lejer". Renaming changes the
cookie names, which signs everyone out once (accepted). Infrastructure identifiers (the
`lejer_app` Postgres role, the Neon/Vercel project names, the npm package) are not brand and
change only by migration.

## Commands

```bash
npm run dev              # dev server
npm run build            # production build + typecheck — gate 1
npm run verify           # scripts/verify suites against the Neon dev branch — gate 2
npm run verify -- rls    # …or just the named suites
npm run start            # serve the production build
npm run migrate          # apply db/migrations/*.sql in order (owner role, DATABASE_URL_ADMIN)
npm run migrate -- --seed  # …then reset the two dev households from db/seed.sql
npm run email:dev        # React Email preview server for emails/*.tsx (port 3001)
npm run send-reminders -- --household <slug>   # run one household's reminder batch from the CLI
npm run import-tidb      # one-time TiDB → Neon import of the two legacy households (see DESIGN.md §11)
```

Two gates, in order: `npm run build` (typecheck + build), then `npm run verify`. `verify`
runs every suite in `scripts/verify/` against the **dev** branch only: it refuses unless
`DATABASE_URL_ADMIN` is dev's direct host and `DATABASE_URL` dev's pooled host, and then
checks that each connection reports dev's `neon.branch_id`. Suites build their own
throwaway households (`verify-<run>-*`, users `@verify.invalid`) and delete them, sweeping
leftovers from crashed runs first, so they never depend on or disturb the seed data. **Every
phase adds its checks there** (a new `scripts/verify/<suite>.ts` registered in `index.ts`).
Suites: `brand`, `emails` (every template renders with its `PreviewProps`), `rls`, `identity`, `bills` (library level, real fixture contexts via
`ctxFor()`), `http` (starts `next start` on gate 1's build, refusing a build older than the
sources; mints sessions with `SESSION_SECRET`; forces console mail; drives server actions the
way the client does: plain forms as `$ACTION_ID_<id>` posts, `useActionState`/direct calls with
a `Next-Action` header and React's `encodeReply` body, referenced `_1_*` fields **before** the
root `"0"`). Suites write real blobs, so `verify` also refuses unless `BLOB_READ_WRITE_TOKEN`
belongs to lejer-blob (the store id is embedded in the token), and its sweep deletes each
fixture household's `h/{id}/` prefix **before** its rows, so a crashed run is cleaned up by the
next one.
`npx tsc --noEmit` typechecks alone.

## Configuration

Env lives in `.env.local` (see `.env.example`). Keys:

- `DATABASE_URL` — Neon **pooled** URL for the `lejer_app` role (RLS enforced). All app code.
- `DATABASE_URL_ADMIN` — Neon **unpooled** URL for `neondb_owner` (table owner, so RLS does
  not apply to it). Only four call sites may use it: `scripts/migrate.ts`,
  `scripts/import-tidb.ts`, `createHousehold()` in `lib/households.ts`, and the household
  enumeration at the top of `app/api/cron/tick`.
  Anything else reading it is a bug, except `scripts/verify/` (dev-only, guarded; it needs the
  owner to build fixtures and inspect the catalog).
- `SESSION_SECRET` — jose HS256 key for the `lejer_session` cookie.
- `RESEND_API_KEY` — sends from `login@mail.lejer.app` (codes, invites) and
  `notify@mail.lejer.app` (household mail). Resend is set up directly at resend.com, not
  through the Vercel marketplace. **Empty outside production = console mode**: `sendMail()`
  prints the message (login codes included) with a `[mail:console]` prefix instead of sending,
  and writes no `email_log` row. In production (`VERCEL_ENV=production`) there is no fallback:
  `instrumentation.ts` refuses to boot without the key, so codes can never land in logs.
- `RESEND_TEST_SENDER` — `1` sends every message from `onboarding@resend.dev` (display name
  kept) until `mail.lejer.app` verifies; set in Vercel's Development env, ignored in
  production. Resend's test sender **only delivers to the Resend account owner's address**, so
  login codes or invites for anyone else (seed users, invitees) need console mode (empty key)
  or the verified domain.
- `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` — the single **private** Blob store. On Vercel the
  SDK uses OIDC; the token is needed locally, for client-upload token minting, and for the
  import script.
- `CRON_SECRET` — bearer token for `/api/cron/tick`; must match the GitHub Actions repo secret.
- `NEXT_PUBLIC_APP_URL` — `https://lejer.app`; used for absolute links in email and `/cal.ics`.
- `APP_DEV_USER` + `APP_DEV_HOUSEHOLD` — bypass login as that email in that household slug.
  Honored only when `VERCEL_ENV !== "production"` (local + preview). There is no passphrase
  login and no `APP_DEMO_MODE`; the demo is the `/demo` route.

**Recovering `.env.local` on a new machine.** The Vercel project's **Development** environment
holds the dev values (Neon `dev` branch URLs, `SESSION_SECRET`, `CRON_SECRET`, the Blob
token and store id), so:

```bash
vercel link --yes --project lejer --scope aaronperkel
vercel env pull .env.local          # Development environment
```

Keys that are empty locally (`RESEND_API_KEY` until it exists, `APP_DEV_*`) are not stored
there; add them by hand. `vercel link`/`env pull` rewrite the whole file (comments are lost;
`.env.example` documents the keys) and add `VERCEL_OIDC_TOKEN`. If the Development values are
ever lost too, reset `lejer_app`'s password on the **dev** branch only (owner connection to
the dev endpoint, `ALTER ROLE lejer_app WITH PASSWORD …`), rebuild the URLs, and push them back
with `vercel env add <KEY> development`. Each Neon branch has its own `lejer_app` password, so
resetting dev's never touches production.

## Architecture

### Request context and tenancy

`lib/context.ts` `getCtx()` (React `cache()`, once per request) turns the session into
`{ user, membership, household, demo }` or `null`, validating the cookie's `hid` against
`memberships` every time. It replaces the old `getCurrentPerson()`.

**No tenant query runs outside `withHousehold`.** `lib/db.ts` exports:

- `withHousehold(ctx, tx => …)` — `sql.begin` that first runs
  `set_config('app.household_id', …, true)` and `set_config('app.user_id', …, true)`, then your
  callback. Pages open one per request and pass `tx` into every `lib/*` data function (they all
  take `tx` first).
- `withUser(userId, tx => …)` — sets only `app.user_id` (`null` before login, e.g. looking up
  the email being verified); for `users`/`login_codes` and the household switcher.
- `adminSql()` — the owner connection, created on first call. See the four allowed call sites
  above.

Clients are created lazily, so importing `lib/db.ts` needs no credentials (the build, scripts).

The raw `sql` client is not exported. If you find yourself importing `postgres` outside
`lib/db.ts`, stop. The one exception is `scripts/verify/harness.ts`, whose RLS probes need raw
transactions with and without GUCs on pooled and direct connections.

**Row-level security is the second lock.** Every household table has `ENABLE ROW LEVEL
SECURITY` — deliberately **not** `FORCE`, so the table owner (`neondb_owner`) is exempt and
`lejer_app` (`NOBYPASSRLS`) is enforced — with policies on
`household_id = app_household_id()`, where `app_household_id()` is
`NULLIF(current_setting('app.household_id', true), '')::int` — the `NULLIF` matters because
a finished `SET LOCAL` leaves `''` on a pooled connection and `''::int` throws. Missing
setting → NULL → zero rows, zero writes. `memberships` and `households` have a wider
**SELECT** policy (rows where `user_id = app_user_id()` / households the user belongs to) so
the switcher can list names; their write policies are household-only. `users` and
`login_codes` have no RLS. `email_log` is the exception to the tenant policy: inserts accept
`household_id IS NULL` (login codes), reads are household-only, there is no UPDATE/DELETE
policy, and account-wide counts go through `email_sends_since(since, kind?)` — a
`SECURITY DEFINER` function that returns only a number, executable by `lejer_app` alone.
Never `INSERT … RETURNING` a NULL-household `email_log` row: `RETURNING` must pass the SELECT
policy, so it fails. The calendar feed has no session, so `calendar_context(token)` (same
`SECURITY DEFINER` hardening) maps a membership's `calendar_token` to
`(household_id, membership_id)` and nothing else; the feed then runs inside `withHousehold`.

**Neon pooling rules** (the pooled endpoint is PgBouncer in transaction mode): never session
`SET`, only `set_config(..., true)` / `SET LOCAL` inside a transaction; `prepare: false` in the
postgres.js options is mandatory; keep transactions short; no `LISTEN`, no session advisory
locks, no temp tables.

### Database

postgres.js (raw SQL, no ORM) with type parsers so `DATE` columns are `YYYY-MM-DD` strings and
`NUMERIC`/`COUNT(*)` are numbers — the Postgres equivalent of the old mysql2 `dateStrings` +
`decimalNumbers`. `TIMESTAMPTZ` stays a `Date`. Schema lives in `db/migrations/` (numbered SQL,
applied by `scripts/migrate.ts`, tracked in `schema_migrations`). `db/seed.sql` seeds one
household of each mode.

Tables (all tenant tables carry `household_id`; children also have composite FKs
`(parent_id, household_id)` so a child can never point across households):

- `households` — settings row: `mode`, `theme` (`statement`|`peach`), `color_scheme`,
  `timezone`, `ask_bill_date`, `bills_per_page`, `feature_*` booleans (rent, trends,
  bulk_email, documents, welcome_tour, thanks), rent columns, reminder schedule
  (`reminders_enabled`, `send_hour` in the household's tz, `first_reminder_days`,
  `urgent_reminder_days`) and cron bookkeeping (`last_run_at`, `last_send_date`,
  `last_sent_at`, `last_sent_count`), email identity (`from_name`, `reply_to`, `digest_email`)
- `users` (`email` citext unique = login identity, `name`) — global
- `memberships` (`household_id`, `user_id`, `role` `admin`|`member`, `splits_bills`,
  `welcomed_at`, `invited_by`, `joined_at` NULL until first sign-in, `calendar_token` 32 random
  bytes base64url, unique, generated on insert, reset with `SET calendar_token = DEFAULT`) —
  everything per-person per-household hangs off `memberships.id`, not `users.id`
- `bill_types` (`name` unique per household, `emoji`, `processing_fee`, `owner_id` →
  memberships, SET NULL on delete)
- `bills` (`type_id` RESTRICT, `bill_date`, `due_date`, `total`, `per_person_cost`, `status`
  `unpaid`|`paid` as a CHECK, `pdf_path`, `added_by_id`, `owner_id` → memberships SET NULL +
  `had_owner`, both set at post time from the type's owner, 0004). The ledger, balances,
  reminders' Reply-To and permission checks on an existing bill (`assertCanManage(ctx,
  bill.ownerId)`) all use the bill's owner; `assertBillManager(tx, ctx, typeId)` (the type's
  current owner) only gates posting new bills. A removed owner reads as `FORMER_MEMBER`
  ("former member"); a bill posted for an ownerless type is owed to "the house"
- `bill_debts` (`bill_id`, `person_id`, `paid_at`) — the bill's debtor set, **written once when
  the bill is posted and never rebuilt** (0003). Paying sets `paid_at`, un-paying clears it, so
  unchecking restores exactly the original debtor and late joiners never get rows on old bills.
  The owner never gets a row. A bill is `paid` when no row has `paid_at IS NULL`; `setPaid` and
  `refreshBillStatus` keep `bills.status` in step transactionally (also after a member removal
  cascades their rows). Everything "still owed" filters `paid_at IS NULL`
- `payment_thanks` — debounced thank-you receipts (`lib/thanks.ts`), only when `feature_thanks`
- `documents` (`file_path` always under `h/{id}/documents/`, `uploaded_by` SET NULL)
- `login_codes` (`email` citext, `code_hash`, `attempts`, `ip_hash`, `created_at`, `expires_at`) —
  keyed by the normalized email, not `users.id`: requesting a code never creates a user
- `email_log` (`household_id` nullable, `kind`, `to_hash`, `ok`, `sent_at`) — every send;
  source of truth for the daily budget (via `email_sends_since()`) and the portal readouts

Bill math: `total = amount + processing_fee`, `per_person_cost = round(total / splitters, 2)`
where splitters are memberships with `splits_bills`; debt rows for every splitter except the
owner. `getOwedPairs(tx)` in `lib/bills.ts` is the who-owes-whom ledger and works in both
modes. SQL aliases snake_case to camelCase (`per_person_cost AS perPersonCost`); bill queries
join `bill_types` and the bill's owner/poster memberships so each `Bill` carries
`typeName`/`typeEmoji`/`ownerId`/`ownerName`/`addedByName`.

### Auth flow

`proxy.ts` requires a valid `lejer_session` (or `lejer_demo`) cookie for everything except
`/login`, `/demo*`, `/cal.ics`, `/api/cron`, `/api/documents/upload`, `/no-access`, icons and
static assets; non-GET without one gets 401, GET redirects to `/login?next=`; the 30-day
session cookie is re-issued once a week old. The session JWT carries `{ uid, hid }` (`hid`
null until the user has a household); the demo JWT is `{ demo: true }`. The two use different
JWT audiences, so neither verifies as the other (`lib/session.ts`). `next=` goes through
`safeNext()` (`lib/flash.ts`), which rejects `//host` and `/\host`.

`getCtx()` order: dev bypass → session → demo cookie (only with no session). A stale or revoked
`hid` falls back to the user's first membership; a signed-in user with no membership gets
`null`, and `getSessionUser()` serves pages that need the user but no household (onboarding,
`/households`, `/account`).

`/login` is the same two-step form as before: email → 6-digit code → session. Differences:
an unknown email still gets a code (anyone can sign up) and the request writes nothing to
`users`; a verified code creates the `users` row with a placeholder name from the email's
local part, and first-timers land on onboarding (`/welcome/household`: their real name first,
then household name, mode, theme, timezone), which calls `createHousehold()` and sets
`ask_bill_date` from the mode. Every email is normalized once (`normalizeEmail()`: trim +
lowercase) and the column is citext, so all per-email caps key on one spelling. Codes: sha256
at rest, 10-minute TTL, 5 wrong guesses, 30 s burst dedupe, 5 per email per 10 min, 10 per IP
per hour (`ip_hash`), and a global 40 per UTC day from `email_sends_since(…, 'login_code')`,
which reserves Resend headroom for household mail. A send that fails releases its code.
Verifying also accepts every pending invite (`joined_at`), one `withHousehold` per household,
since `memberships_write` only admits the current one.

**Library mutations take `ctx` and authorize themselves** (`assertAdmin(ctx)`,
`assertBillManager(tx, ctx, typeId)` in `lib/auth.ts`), throwing `ActionError` (`lib/errors.ts`)
for anything the person should be told; actions turn it into `?err=` or an inline error, and
anything else propagates as a bug. Pages read through one loader each in `lib/views.ts`, which
is where the `ctx.demo` branch lives.

**Page-level authorization** is `requireUser()` (no ctx → onboarding if signed in, else
`/login`) / `requireAdmin()` (`/no-access`) in `lib/auth.ts`, and `requireUserAction()` /
`requireAdminAction()` / `requireBillManager(tx, typeId)` for server actions (throw). Every
action authorizes itself; `proxy.ts` is only the first lock. A `member` can read everything
(including `/portal/household`, read-only) and, for types they own, post bills and mark
payments. `admin` does everything. The last **joined** admin can't be demoted, and nobody can
remove themselves. Invites are memberships with `joined_at NULL` plus a `users` row created up
front (an admin vouched for the address; the typed name only applies if the person is new);
the code login proves address ownership, so there is no invite-token table. Names live on
`users` and are shared across households, so only their owner edits them (`/account`).

Switcher: `/households` lists the user's memberships; choosing one re-issues the cookie with the
new `hid` (and accepts it if it was a pending invite). Nav shows the household name and a
dropdown only when there is more than one. The dev bypass pins `APP_DEV_HOUSEHOLD`, so switching
does nothing while it is set.

Demo: `GET /demo` sets `lejer_demo` and opens `/`. `lib/demo.ts` serves an in-memory ledger
household, `withHousehold` throws on a demo scope, and actions refuse with `DEMO_REFUSAL`. A
signed-in user hitting `/demo` gets `/demo/signed-in` ("You're signed in to <household>. Sign
out to view the demo, or go back.") and is never dropped into either household silently.

### Stored files

One private Blob store. Keys (`lib/blob.ts`): bill PDFs
`h/{household_id}/bills/{year}/{type-slug}/{MMDD}-{billId}.pdf` (MMDD from the bill date; the
bill id keeps same-day bills apart; `allowOverwrite: true`; the upload's own filename is ignored
because providers reuse one name per statement; `addBill` reserves the id with `prepareBill`,
uploads, then inserts); documents
`h/{household_id}/documents/{slug}-{suffix}.{ext}` (`addRandomSuffix: true`).

`app/files/[...path]/route.ts` is the only read path: requires a ctx, rejects keys not under
`h/{ctx.household.id}/`, then confirms the key exists in `bills.pdf_path` or
`documents.file_path` **inside `withHousehold`** (RLS as the second lock), applies the extension
allowlist (pdf/png/jpg/jpeg/heic/heif, no SVG) + `nosniff`, and streams `get()`.

Bill PDFs go through the `addBill` server action (4 MB `bodySizeLimit` under Vercel's 4.5 MB
cap, optional). Documents upload client-direct via `handleUpload` in
`app/api/documents/upload/route.ts`, which gates on `requireAdminAction()` and **refuses** any
pathname outside the household's documents prefix (the client token is bound to the requested
pathname and can't be rewritten; the page passes the prefix to the form); `onUploadCompleted` is intentionally a no-op
(never fires against localhost) and `addDocument()` `head()`s the key before inserting.

### Email

`lib/mail.ts` wraps Resend: `sendMail({ ctx?, to, subject, react, replyTo?, kind })` returns
`false` on failure (logged, not thrown) and writes one `email_log` row per attempt (except in
console mode), in its own short transaction after the send, without `RETURNING`. `ctx` logs
the row under that household; without it the row is `household_id NULL`. From is
`"{from_name ?? household name} via Lejer" <notify@mail.lejer.app>`; Reply-To is
`households.reply_to`, except reminder and new-bill emails use the bill owner's email.
Login codes and invites come from `"Lejer" <login@mail.lejer.app>` with no Reply-To.

New-bill and reminder mail (`lib/notify.ts`) goes only to members who have **joined**: a
pending invite's address isn't proven, so it gets nothing but the invite. Reminders are urgent
within the household's `urgent_reminder_days`, counted in its own calendar (`lib/time.ts`).

Templates are React Email components in `emails/`, all wrapped in `emails/Shell.tsx`, which
renders the statement or peach shell from `households.theme` (inline styles only, light-only,
560 px). Copy is gender-neutral; the noun ("statement"/"ledger") follows the theme.

### Cron

`app/api/cron/tick/route.ts` (bearer `CRON_SECRET`, `maxDuration = 120`): enumerates
households with `adminSql`, then per household inside `withHousehold`: stamps `last_run_at`,
flushes the thanks queue (own 10-minute debounce, every tick, if `feature_thanks`), and runs
the reminder batch on the first tick at or after `send_hour` in the household's timezone, at
most once per local day (`last_send_date`). Before a batch it checks the account-wide UTC-day
send count (`email_sends_since()`); a batch that would push the day past 80 is **deferred**
(no stamp, logged in the response) because Resend's free tier is 100/day. Core logic is `lib/reminders.ts`
(heads-up at exactly N days before due, urgent at ≤ M days including overdue), shared with
`scripts/send-reminders.ts`.

Scheduler is `.github/workflows/tick.yml` pinging hourly; Vercel Hobby crons run once a day,
which would defeat the portal-configurable send hour. GitHub drops delayed runs, which the
"at or after, once per day" rule tolerates.

### Key surfaces

- `app/page.tsx` — dashboard: mode-aware summary strip (you owe / next due / bills on record),
  house ledger (hidden in single-payer when the viewer is the payer), bills grouped by year,
  calendar subscribe buttons
- `app/portal/` — `/portal` bills (add-bill disclosure honoring `ask_bill_date`, payment
  checkboxes, per-bill reminders), `/portal/household` members (invite/edit/remove) + bill
  types (owner column in ledger mode), `/portal/settings` (features, theme, reminders,
  timezone, email identity, rent, mode switch), `/portal/email` bulk email (feature-gated).
  All mutations are server actions (portal ones in `app/portal/actions.ts`); flash messages
  travel as `?ok=`/`?err=` query params via `done()`/`fail()` in `lib/flash.ts` (plain
  functions, so they aren't exposed as actions), rendered by `app/components/Flash.tsx`
- `app/documents/` — household paperwork (feature-gated); everyone reads, admins manage
- `app/trends/` — Chart.js per bill type, CSV at `/trends/csv` (feature-gated)
- `app/welcome/` — onboarding wizard for new users and the animated tour (feature-gated)
- `app/households/` — the switcher (+ "start a new household")
- `app/account/` — your name (all households) and "reset my calendar link" for the current one
- `app/login/` — the code flow and `signOut`
- `app/demo/` — `route.ts` sets the `lejer_demo` cookie over the in-memory household in
  `lib/demo.ts`; `signed-in/` is the notice for signed-in visitors; data functions branch on
  `ctx.demo`, mutations refuse politely
- `app/cal.ics/route.ts` — public iCal feed per membership (`/cal.ics?k=<calendar_token>`, no
  household param), resolved through `calendar_context()`; removing the membership kills the
  feed, and "reset my calendar link" issues a new token

### Styling

Tailwind v4, CSS-first config in `app/globals.css`. Raw values live on `:root` (the
"statement" theme: paper ledger, one accent blue, IBM Plex Mono as the ledger face) and are
mapped to utilities in `@theme inline`; `[data-theme="peach"]` overrides them with the peach
awning theme (cream/espresso/deep peach, Fraunces display, Karla body, Courier Prime ledger,
the `.awning` band). `<html data-theme data-color-scheme>` is set by the root layout from the
household. The statement dark block is gated on `data-color-scheme="system"`; peach is
light-only. Green/red/amber (sage/rose/butter in peach) are reserved for paid/unpaid/due-soon.
Shared component classes (`.panel`, `.eyebrow`, `.figure`, `.btn*`, `.tag*`, `.due-*`,
`.field-*`, `.data-table`, `.tab*`, `.flash*`, `.table-stack*`) live in `@layer components` —
Tailwind v4 cannot `@apply` a custom class from the same layer.

## Verifying changes locally

Start with the two gates (`npm run build`, `npm run verify`). Pages stream under the root
`loading.tsx`, so `notFound()` renders the not-found UI with a 200 status (the status line has
already gone out); check for the UI, not the code. Dev points at the Neon `dev` branch, not production; `npm run migrate -- --seed` sets it up
(seed users `alex@example.com` / `sam@example.com`, households `elm-street` single-payer and
`oak-lane` ledger, both users in both). Set `APP_DEV_USER` / `APP_DEV_HOUSEHOLD` to skip
login. With `RESEND_API_KEY` empty, login codes print to the dev server's output
(`[mail:console] login_code to …`), so the real login flow works locally for any address.
Server actions can be driven over the wire like a no-JS browser: POST `multipart/form-data` to
the page with a `$ACTION_ID_<id>` field plus the form fields, ids from
`.next/dev/server/server-reference-manifest.json` (`exportedName`); the response is a 303 whose
`Location` carries `?ok=`/`?err=`. To tick the cron
safely, check `households.last_send_date` first; a tick past `send_hour` on a day that hasn't
sent will email real members of every household in that database.

## Deployment

Vercel (Hobby) at lejer.app, Neon (free), one private Blob store, Resend (free, domain
`mail.lejer.app`).

**Neon** is not a Vercel marketplace integration (that integration owns `DATABASE_URL` and
would point it at the owner role, skipping RLS). Project `lejer` (`round-grass-59501457`) in
the Aaron Perkel LLC org, `aws-us-east-1`, Postgres 17; branch `main` is production, `dev` is
local development. `lejer_app` was created with SQL on `main` before `dev` was branched, so
both branches have it, each with its own password (dev's was reset 2026-10-06; set or reset
main's with `ALTER ROLE` when Production env is configured):

```sql
CREATE ROLE lejer_app LOGIN PASSWORD '<openssl rand -base64 24, URL-safe>' NOBYPASSRLS;
```

Never create it in the console (console roles join `neon_superuser`). `0001_init.sql` refuses
to run if the role is missing or can bypass RLS. Drop `channel_binding` from Neon's
connection strings; postgres.js would forward it as a startup parameter.

**Vercel** project `lejer` in the `aaronperkel` (Hobby) scope, linked with the CLI, no Git
connection yet. Blob store `lejer-blob` (`store_kmuAqgMI8w1nbg75`, private, `iad1`) was
created with `vercel blob create-store` and is connected to **Development only** so far;
connect it to Preview/Production when those environments are configured. Resend is a
direct resend.com account, not a marketplace integration.

**Vercel env vars, set by hand** in the project. Development holds the dev-branch values
(the `.env.local` recovery path above). Production (uses `main`) and Preview (may use `dev`
or its own branch) are **not set yet**:

| Var | Value |
|---|---|
| `DATABASE_URL` | `lejer_app` on the `main` **pooled** host (`…-pooler…`), `?sslmode=require` |
| `DATABASE_URL_ADMIN` | `neondb_owner` on the `main` **unpooled** host, `?sslmode=require` |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | from the resend.com dashboard (API Keys) |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` | connecting the Blob store sets the token; the id is `store_kmuAqgMI8w1nbg75` |
| `CRON_SECRET` | random; also the GitHub Actions repo secret |
| `NEXT_PUBLIC_APP_URL` | `https://lejer.app` |

`APP_DEV_USER` / `APP_DEV_HOUSEHOLD` are never set in Production (and are ignored there).
Run `npm run migrate` against `main` with its `DATABASE_URL_ADMIN` before the first deploy
and after every new migration. Free-tier ceilings and where they bite first are in `DESIGN.md` §10 — the two to
respect are Neon's 100 CU-hours (never ping more than hourly) and Resend's 100 emails/day
(the cron budget and login-code caps exist for this).

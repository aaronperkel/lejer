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

**One data model, two modes.** Every bill type has an `owner_id`; debts on a bill run to the
owner. `households.mode` is `single_payer` (every type owned by the same person; UI hides the
owner column, dashboard says "you owe") or `ledger` (types carry their own owners, dashboard
shows who-owes-whom). Mode is a setting that drives defaults and copy; switching never
migrates data.

## Commands

```bash
npm run dev              # dev server
npm run build            # production build + typecheck — the main verification gate
npm run start            # serve the production build
npm run migrate          # apply db/migrations/*.sql in order (owner role, DATABASE_URL_ADMIN)
npm run email:dev        # React Email preview server for emails/*.tsx
npm run send-reminders -- --household <slug>   # run one household's reminder batch from the CLI
npm run import-tidb      # one-time TiDB → Neon import of the two legacy households (see DESIGN.md §11)
```

There is no test suite; `npm run build` plus hitting routes against a Neon branch is the
verification path. `npx tsc --noEmit` typechecks alone.

## Configuration

Env lives in `.env.local` (see `.env.example`). Keys:

- `DATABASE_URL` — Neon **pooled** URL for the `lejer_app` role (RLS enforced). All app code.
- `DATABASE_URL_ADMIN` — Neon **unpooled** URL for `neondb_owner` (bypasses RLS). Only four
  call sites may use it: `scripts/migrate.ts`, `scripts/import-tidb.ts`, `createHousehold()`
  in `lib/households.ts`, and the household enumeration at the top of `app/api/cron/tick`.
  Anything else reading it is a bug.
- `SESSION_SECRET` — jose HS256 key for the `lejer_session` cookie.
- `RESEND_API_KEY` — sends from `login@mail.lejer.app` (codes, invites) and
  `notify@mail.lejer.app` (household mail).
- `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` — the single **private** Blob store. On Vercel the
  SDK uses OIDC; the token is needed locally, for client-upload token minting, and for the
  import script.
- `CRON_SECRET` — bearer token for `/api/cron/tick`; must match the GitHub Actions repo secret.
- `NEXT_PUBLIC_APP_URL` — `https://lejer.app`; used for absolute links in email and `/cal.ics`.
- `APP_DEV_USER` + `APP_DEV_HOUSEHOLD` — bypass login as that email in that household slug.
  Honored only when `VERCEL_ENV !== "production"` (local + preview). There is no passphrase
  login and no `APP_DEMO_MODE`; the demo is the `/demo` route.

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
- `withUser(userId, tx => …)` — sets only `app.user_id`; for `users`/`login_codes` and the
  household switcher.
- `adminSql` — the owner connection. See the four allowed call sites above.

The raw `sql` client is not exported. If you find yourself importing `postgres` outside
`lib/db.ts`, stop.

**Row-level security is the second lock.** Every household table has `ENABLE` + `FORCE ROW
LEVEL SECURITY` with policies on `household_id = app_household_id()`, where
`app_household_id()` is `NULLIF(current_setting('app.household_id', true), '')::int` — the
`NULLIF` matters because a finished `SET LOCAL` leaves `''` on a pooled connection and `''::int`
throws. Missing setting → NULL → zero rows, zero writes. `memberships` and `households` have a
wider **SELECT** policy (rows where `user_id = app_user_id()` / households the user belongs to)
so the switcher can list names; their write policies are household-only. `users` and
`login_codes` have no RLS.

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
  `welcomed_at`, `invited_by`, `joined_at` NULL until first sign-in) — everything per-person
  per-household hangs off `memberships.id`, not `users.id`
- `bill_types` (`name` unique per household, `emoji`, `processing_fee`, `owner_id` →
  memberships, SET NULL on delete)
- `bills` (`type_id` RESTRICT, `bill_date`, `due_date`, `total`, `per_person_cost`, `status`
  `unpaid`|`paid` as a CHECK, `pdf_path`, `added_by_id`)
- `bill_debts` (`bill_id`, `person_id`) — who still owes; **rows are deleted as people pay**;
  the owner never gets a row; bill flips to `paid` when none remain (`updateOwes`, transactional)
- `payment_thanks` — debounced thank-you receipts (`lib/thanks.ts`), only when `feature_thanks`
- `documents` (`file_path` always under `h/{id}/documents/`, `uploaded_by` SET NULL)
- `login_codes` (`user_id`, `code_hash`, `attempts`, `ip_hash`, `created_at`, `expires_at`)
- `email_log` (`household_id` nullable, `kind`, `to_hash`, `ok`, `sent_at`) — every send;
  source of truth for the daily budget and the portal readouts

Bill math: `total = amount + processing_fee`, `per_person_cost = round(total / splitters, 2)`
where splitters are memberships with `splits_bills`; debt rows for every splitter except the
owner. `getOwedPairs(tx)` in `lib/bills.ts` is the who-owes-whom ledger and works in both
modes. SQL aliases snake_case to camelCase (`per_person_cost AS perPersonCost`); bill queries
join `bill_types` and owner/poster memberships so each `Bill` carries
`typeName`/`typeEmoji`/`ownerId`/`ownerName`/`addedByName`.

### Auth flow

`proxy.ts` requires a valid `lejer_session` cookie for everything except `/login`, `/demo`,
`/cal.ics`, `/api/cron`, `/api/documents/upload`, `/no-access`, icons and static assets;
non-GET without a session gets 401, GET redirects to `/login?next=`; the 30-day cookie is
re-issued once a week old. The JWT carries `{ uid, hid }`.

`/login` is the same two-step form as before: email → 6-digit code → session. Differences:
an unknown email still gets a code (anyone can sign up), verifying creates the `users` row,
and first-timers land on onboarding (`/welcome/household`: name, mode, theme, timezone) which
calls `createHousehold()`. Codes: sha256 at rest, 10-minute TTL, 5 wrong guesses, 30 s burst
dedupe, 5 per email per 10 min, 10 per IP per hour (`ip_hash`), and a global 40 per UTC day
from `email_log` — the last one reserves Resend headroom for household mail.

**Page-level authorization** is `requireUser()` / `requireAdmin()` (`lib/auth.ts`, redirect to
`/no-access`) and `requireAdminAction()` / `requireBillManager(tx, typeId)` for server actions
(throw). A `member` can read everything and, for types they own, post bills and mark payments.
`admin` does everything. Invites are just memberships with `joined_at NULL` plus an email —
the code login proves address ownership, so there is no invite-token table.

Switcher: `/households` lists the user's memberships; choosing one re-issues the cookie with the
new `hid`. Nav shows the household name and a dropdown only when there is more than one.

### Stored files

One private Blob store. Keys: bill PDFs `h/{household_id}/bills/{year}/{type}/{MMDD}.pdf`
(MMDD from the bill date, `allowOverwrite: true`, the upload's own filename is ignored because
providers reuse one name per statement); documents
`h/{household_id}/documents/{slug}-{suffix}.{ext}` (`addRandomSuffix: true`).

`app/files/[...path]/route.ts` is the only read path: requires a ctx, rejects keys not under
`h/{ctx.household.id}/`, then confirms the key exists in `bills.pdf_path` or
`documents.file_path` **inside `withHousehold`** (RLS as the second lock), applies the extension
allowlist (pdf/png/jpg/jpeg/heic/heif, no SVG) + `nosniff`, and streams `get()`.

Bill PDFs go through the `addBill` server action (4 MB `bodySizeLimit` under Vercel's 4.5 MB
cap, optional). Documents upload client-direct via `handleUpload` in
`app/api/documents/upload/route.ts`, which gates on `requireAdminAction()` and **rewrites** the
pathname under the household's documents prefix; `onUploadCompleted` is intentionally a no-op
(never fires against localhost) and `addDocument()` `head()`s the key before inserting.

### Email

`lib/mail.ts` wraps Resend: `sendMail({ ctx?, to, subject, react, replyTo?, kind })` returns
`false` on failure (logged, not thrown) and always writes `email_log`. From is
`"{from_name ?? household name} via Lejer" <notify@mail.lejer.app>`; Reply-To is
`households.reply_to`, except reminder and new-bill emails use the bill owner's email.
Login codes and invites come from `"Lejer" <login@mail.lejer.app>` with no Reply-To.

Templates are React Email components in `emails/`, all wrapped in `emails/Shell.tsx`, which
renders the statement or peach shell from `households.theme` (inline styles only, light-only,
560 px). Copy is gender-neutral; the noun ("statement"/"ledger") follows the theme.

### Cron

`app/api/cron/tick/route.ts` (bearer `CRON_SECRET`, `maxDuration = 120`): enumerates
households with `adminSql`, then per household inside `withHousehold`: stamps `last_run_at`,
flushes the thanks queue (own 10-minute debounce, every tick, if `feature_thanks`), and runs
the reminder batch on the first tick at or after `send_hour` in the household's timezone, at
most once per local day (`last_send_date`). Before a batch it checks the UTC-day send count in
`email_log`; a batch that would push the day past 80 is **deferred** (no stamp, logged in the
response) because Resend's free tier is 100/day. Core logic is `lib/reminders.ts`
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
  All mutations are server actions; flash messages travel as `?ok=`/`?err=` query params via
  `done()`/`fail()` in `app/portal/actions.ts`
- `app/documents/` — household paperwork (feature-gated); everyone reads, admins manage
- `app/trends/` — Chart.js per bill type, CSV at `/trends/csv` (feature-gated)
- `app/welcome/` — onboarding wizard for new users and the animated tour (feature-gated)
- `app/households/` — the switcher
- `app/demo/` — signed demo session over the in-memory household in `lib/demo.ts`; data
  functions branch on `ctx.demo`, mutations refuse politely
- `app/cal.ics/route.ts` — public iCal feed per household (`/cal.ics?h=<slug>&k=<token>`)

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

Dev points at a Neon **branch**, not production; `npm run migrate` and `db/seed.sql` set one up.
Set `APP_DEV_USER` / `APP_DEV_HOUSEHOLD` to skip login. Server actions can be driven over the
wire the same way as in `../utilities/.claude/skills/verify/SKILL.md`. To tick the cron
safely, check `households.last_send_date` first; a tick past `send_hour` on a day that hasn't
sent will email real members of every household in that database.

## Deployment

Vercel (Hobby) at lejer.app, Neon (free), one private Blob store, Resend (free, domain
`mail.lejer.app`). Env above set in the Vercel project; `CRON_SECRET` also as a GitHub repo
secret. Free-tier ceilings and where they bite first are in `DESIGN.md` §10 — the two to
respect are Neon's 100 CU-hours (never ping more than hourly) and Resend's 100 emails/day
(the cron budget and login-code caps exist for this).

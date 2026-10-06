-- Lejer schema: households, users, memberships and everything that hangs off them.
-- Applied by scripts/migrate.ts as neondb_owner (DATABASE_URL_ADMIN), which owns every table.
--
-- Tenancy (DESIGN.md §4): every household table carries household_id and has row-level
-- security ENABLED (not FORCED). The table owner is therefore exempt, and lejer_app (the app
-- role, NOBYPASSRLS) only sees rows where household_id matches the transaction-local
-- app.household_id. Children use composite FKs (parent_id, household_id) so a row can never
-- point at another household's parent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lejer_app') THEN
    RAISE EXCEPTION 'role lejer_app is missing; create it first (CLAUDE.md, Deployment)';
  END IF;
  IF (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = 'lejer_app') THEN
    RAISE EXCEPTION 'lejer_app must be NOBYPASSRLS and not a superuser';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS citext;

-- GUC readers. After a SET LOCAL transaction ends, a pooled connection reports the setting
-- as '' (not NULL) and ''::int throws, hence NULLIF. Missing → NULL → policies match nothing.
CREATE FUNCTION app_household_id() RETURNS int LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.household_id', true), '')::int $$;
CREATE FUNCTION app_user_id() RETURNS int LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.user_id', true), '')::int $$;

-- ---------------------------------------------------------------------------------------------
-- Global identity (no RLS: login runs before any household is known)

CREATE TABLE users (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      CITEXT      NOT NULL UNIQUE,  -- login identity
  name       TEXT        NOT NULL,         -- one person, one name across households
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email login codes: sha256 at rest, 10-minute TTL, 5 wrong guesses (lib/login-codes.ts).
CREATE TABLE login_codes (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users ON DELETE CASCADE,
  code_hash  CHAR(64)    NOT NULL,
  attempts   SMALLINT    NOT NULL DEFAULT 0,
  ip_hash    CHAR(64)    NULL,      -- sha256 of x-forwarded-for's first hop, never the raw IP
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX login_codes_user_created ON login_codes (user_id, created_at);
CREATE INDEX login_codes_ip_created   ON login_codes (ip_hash, created_at) WHERE ip_hash IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- Households: the settings row (folds in the old rent_config and reminder_config)

CREATE TABLE households (
  id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                 TEXT        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                 TEXT        NOT NULL,
  tagline              TEXT        NULL,
  mode                 TEXT        NOT NULL CHECK (mode IN ('single_payer', 'ledger')),
  theme                TEXT        NOT NULL DEFAULT 'statement' CHECK (theme IN ('statement', 'peach')),
  color_scheme         TEXT        NOT NULL DEFAULT 'system' CHECK (color_scheme IN ('system', 'light')),
  timezone             TEXT        NOT NULL DEFAULT 'America/New_York',  -- IANA
  ask_bill_date        BOOLEAN     NOT NULL,  -- no default: on for single_payer, off for ledger
  bills_per_page       INTEGER     NOT NULL DEFAULT 10 CHECK (bills_per_page BETWEEN 1 AND 100),

  feature_rent         BOOLEAN     NOT NULL DEFAULT false,
  feature_trends       BOOLEAN     NOT NULL DEFAULT false,
  feature_bulk_email   BOOLEAN     NOT NULL DEFAULT false,
  feature_documents    BOOLEAN     NOT NULL DEFAULT false,
  feature_welcome_tour BOOLEAN     NOT NULL DEFAULT false,
  feature_thanks       BOOLEAN     NOT NULL DEFAULT true,

  monthly_rent         NUMERIC(10,2) NULL,
  lease_start          DATE        NULL,
  lease_end            DATE        NULL,
  CHECK (lease_end IS NULL OR lease_start IS NULL OR lease_end >= lease_start),

  reminders_enabled    BOOLEAN     NOT NULL DEFAULT true,
  send_hour            SMALLINT    NOT NULL DEFAULT 9 CHECK (send_hour BETWEEN 0 AND 23),  -- household tz
  first_reminder_days  SMALLINT    NOT NULL DEFAULT 7 CHECK (first_reminder_days >= 0),    -- heads-up at exactly N days out
  urgent_reminder_days SMALLINT    NOT NULL DEFAULT 3 CHECK (urgent_reminder_days >= 0),   -- urgent at <= N days, incl. overdue
  last_run_at          TIMESTAMPTZ NULL,   -- last authorized cron tick
  last_send_date       DATE        NULL,   -- local date the batch last ran (once-per-day guard)
  last_sent_at         TIMESTAMPTZ NULL,   -- last time reminder emails actually went out
  last_sent_count      INTEGER     NOT NULL DEFAULT 0,

  from_name            TEXT        NULL,   -- "{from_name ?? name} via Lejer"
  reply_to             CITEXT      NULL,
  digest_email         CITEXT      NULL,   -- optional confirmation copies

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-person, per-household. Everything personal in a household hangs off memberships.id.
CREATE TABLE memberships (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id INTEGER     NOT NULL REFERENCES households ON DELETE CASCADE,
  user_id      INTEGER     NOT NULL REFERENCES users ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  splits_bills BOOLEAN     NOT NULL DEFAULT true,  -- false: signs in, sees everything, never owes
  welcomed_at  TIMESTAMPTZ NULL,                   -- finished the welcome tour
  invited_by   INTEGER     NULL,
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at    TIMESTAMPTZ NULL,                   -- NULL until first sign-in (pending invite)
  UNIQUE (household_id, user_id),
  UNIQUE (id, household_id),
  FOREIGN KEY (invited_by, household_id) REFERENCES memberships (id, household_id)
    ON DELETE SET NULL (invited_by)
);
CREATE INDEX memberships_user ON memberships (user_id);

-- ---------------------------------------------------------------------------------------------
-- Bills

CREATE TABLE bill_types (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id   INTEGER       NOT NULL REFERENCES households ON DELETE CASCADE,
  name           TEXT          NOT NULL,
  emoji          TEXT          NOT NULL,
  processing_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  owner_id       INTEGER       NULL,  -- who fronts it; debts on its bills run to them
  UNIQUE (household_id, name),
  UNIQUE (id, household_id),
  FOREIGN KEY (owner_id, household_id) REFERENCES memberships (id, household_id)
    ON DELETE SET NULL (owner_id)
);

CREATE TABLE bills (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id    INTEGER       NOT NULL REFERENCES households ON DELETE CASCADE,
  type_id         INTEGER       NOT NULL,
  bill_date       DATE          NOT NULL,  -- statement date
  due_date        DATE          NOT NULL,
  total           NUMERIC(10,2) NOT NULL,  -- amount + processing fee
  per_person_cost NUMERIC(10,2) NOT NULL,  -- round(total / splitters, 2)
  status          TEXT          NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  pdf_path        TEXT          NULL CHECK (pdf_path LIKE 'h/' || household_id || '/bills/%'),
  added_by_id     INTEGER       NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (id, household_id),
  FOREIGN KEY (type_id, household_id) REFERENCES bill_types (id, household_id) ON DELETE RESTRICT,
  FOREIGN KEY (added_by_id, household_id) REFERENCES memberships (id, household_id)
    ON DELETE SET NULL (added_by_id)
);
CREATE INDEX bills_household_due  ON bills (household_id, due_date);
CREATE INDEX bills_household_date ON bills (household_id, bill_date);
CREATE INDEX bills_type           ON bills (type_id);

-- A row means the person still owes their share. Rows are deleted as people pay; the bill
-- flips to 'paid' when none remain (updateOwes). The type's owner never gets a row.
CREATE TABLE bill_debts (
  household_id INTEGER NOT NULL,
  bill_id      INTEGER NOT NULL,
  person_id    INTEGER NOT NULL,
  PRIMARY KEY (bill_id, person_id),
  FOREIGN KEY (bill_id, household_id)   REFERENCES bills (id, household_id)       ON DELETE CASCADE,
  FOREIGN KEY (person_id, household_id) REFERENCES memberships (id, household_id) ON DELETE CASCADE
);
CREATE INDEX bill_debts_person ON bill_debts (household_id, person_id);

-- Debounced thank-you receipts (lib/thanks.ts), only when feature_thanks.
CREATE TABLE payment_thanks (
  household_id INTEGER     NOT NULL,
  bill_id      INTEGER     NOT NULL,
  person_id    INTEGER     NOT NULL,
  queued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),  -- re-checking restarts the debounce
  PRIMARY KEY (bill_id, person_id),
  FOREIGN KEY (bill_id, household_id)   REFERENCES bills (id, household_id)       ON DELETE CASCADE,
  FOREIGN KEY (person_id, household_id) REFERENCES memberships (id, household_id) ON DELETE CASCADE
);
CREATE INDEX payment_thanks_person ON payment_thanks (household_id, person_id);

-- ---------------------------------------------------------------------------------------------
-- Documents and mail

CREATE TABLE documents (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id INTEGER     NOT NULL REFERENCES households ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  category     TEXT        NOT NULL,  -- key from the code-side category list
  file_path    TEXT        NOT NULL UNIQUE CHECK (file_path LIKE 'h/' || household_id || '/documents/%'),
  content_type TEXT        NOT NULL,
  file_size    INTEGER     NOT NULL,  -- bytes
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by  INTEGER     NULL,      -- NULL once that member is removed
  FOREIGN KEY (uploaded_by, household_id) REFERENCES memberships (id, household_id)
    ON DELETE SET NULL (uploaded_by)
);
CREATE INDEX documents_household ON documents (household_id, uploaded_at);

-- Every send, household or not. Source of truth for the daily Resend budget and the
-- portal readouts. household_id is NULL for login codes and invites-before-household mail.
CREATE TABLE email_log (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id INTEGER     NULL REFERENCES households ON DELETE CASCADE,
  kind         TEXT        NOT NULL,
  to_hash      CHAR(64)    NOT NULL,  -- sha256 of the recipient address
  ok           BOOLEAN     NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_log_sent_at   ON email_log (sent_at);
CREATE INDEX email_log_household ON email_log (household_id, sent_at);

-- ---------------------------------------------------------------------------------------------
-- Row-level security

ALTER TABLE households     ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_debts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_thanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log      ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant ON bill_types
  USING (household_id = app_household_id()) WITH CHECK (household_id = app_household_id());
CREATE POLICY tenant ON bills
  USING (household_id = app_household_id()) WITH CHECK (household_id = app_household_id());
CREATE POLICY tenant ON bill_debts
  USING (household_id = app_household_id()) WITH CHECK (household_id = app_household_id());
CREATE POLICY tenant ON payment_thanks
  USING (household_id = app_household_id()) WITH CHECK (household_id = app_household_id());
CREATE POLICY tenant ON documents
  USING (household_id = app_household_id()) WITH CHECK (household_id = app_household_id());

-- Readable for the current household OR any row that is mine (the switcher); writable only
-- inside the current household. Permissive policies OR per command, so SELECT gets the union.
CREATE POLICY memberships_read ON memberships FOR SELECT
  USING (household_id = app_household_id() OR user_id = app_user_id());
CREATE POLICY memberships_write ON memberships FOR ALL
  USING (household_id = app_household_id()) WITH CHECK (household_id = app_household_id());

CREATE POLICY households_read ON households FOR SELECT
  USING (id = app_household_id()
         OR id IN (SELECT household_id FROM memberships WHERE user_id = app_user_id()));
CREATE POLICY households_write ON households FOR ALL
  USING (id = app_household_id()) WITH CHECK (id = app_household_id());

-- Append-only for lejer_app (no UPDATE/DELETE policy). Login-code sends have no household.
-- Reads stay household-only, so INSERT ... RETURNING a NULL-household row fails: don't.
CREATE POLICY email_log_read ON email_log FOR SELECT
  USING (household_id = app_household_id());
CREATE POLICY email_log_insert ON email_log FOR INSERT
  WITH CHECK (household_id IS NULL OR household_id = app_household_id());

-- Account-wide send count for the Resend budget (cron: 80/day) and the login-code cap
-- (40/day). Runs as the owner so it sees every row, and returns only a number.
CREATE FUNCTION email_sends_since(since timestamptz, only_kind text DEFAULT NULL) RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT count(*)::int FROM email_log
     WHERE sent_at >= since AND (only_kind IS NULL OR kind = only_kind) $$;
REVOKE EXECUTE ON FUNCTION email_sends_since(timestamptz, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------
-- Grants for the app role

GRANT USAGE ON SCHEMA public TO lejer_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lejer_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO lejer_app;
GRANT EXECUTE ON FUNCTION email_sends_since(timestamptz, text) TO lejer_app;
REVOKE ALL ON schema_migrations FROM lejer_app;

ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lejer_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO lejer_app;

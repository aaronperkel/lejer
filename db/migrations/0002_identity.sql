-- Phase 2 (identity): email-keyed login codes, per-membership calendar tokens, and the
-- ask_bill_date default. ARCHITECTURE.md §4 (calendar_context) and §5 (login).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;  -- gen_random_bytes

-- ---------------------------------------------------------------------------------------------
-- Login codes are keyed by the (normalized) email, not users.id: anyone can request a code, and
-- requesting one must never create a users row. The row is created when the code verifies.
-- Codes are ephemeral, so existing rows are simply dropped.

DELETE FROM login_codes;
ALTER TABLE login_codes DROP COLUMN user_id;  -- also drops login_codes_user_created
ALTER TABLE login_codes ADD COLUMN email CITEXT NOT NULL;
CREATE INDEX login_codes_email_created ON login_codes (email, created_at);

-- ---------------------------------------------------------------------------------------------
-- Calendar feed tokens: one per membership (32 random bytes, base64url). Removing a membership
-- kills its feed; `UPDATE memberships SET calendar_token = DEFAULT` rotates one person's link.
-- ADD COLUMN evaluates the volatile default per row, so existing memberships get distinct tokens.

ALTER TABLE memberships ADD COLUMN calendar_token TEXT NOT NULL
  DEFAULT rtrim(translate(encode(public.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
ALTER TABLE memberships ADD CONSTRAINT memberships_calendar_token_key UNIQUE (calendar_token);

-- /cal.ics has no session. This maps a token to its membership and household and returns
-- nothing else; the feed then runs inside withHousehold for that household.
CREATE FUNCTION calendar_context(token text)
  RETURNS TABLE (household_id int, membership_id int)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT m.household_id, m.id FROM memberships m WHERE m.calendar_token = token $$;
REVOKE EXECUTE ON FUNCTION calendar_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calendar_context(text) TO lejer_app;

-- ---------------------------------------------------------------------------------------------
-- The onboarding wizard sets ask_bill_date (on for single_payer); the column defaults off.

ALTER TABLE households ALTER COLUMN ask_bill_date SET DEFAULT false;

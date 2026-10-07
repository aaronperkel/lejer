-- Dev seed: one household per mode, two users who belong to both (so the switcher has
-- something to switch). Re-running deletes and recreates only these two households.
-- Load with `npm run migrate -- --seed`; sign in locally with
--   APP_DEV_USER=alex@example.com APP_DEV_HOUSEHOLD=elm-street   (single payer)
--   APP_DEV_USER=sam@example.com  APP_DEV_HOUSEHOLD=oak-lane     (ledger)

DELETE FROM households WHERE slug IN ('elm-street', 'oak-lane');

INSERT INTO users (email, name) VALUES
  ('alex@example.com', 'Alex'),
  ('sam@example.com',  'Sam')
ON CONFLICT (email) DO NOTHING;

-- Single payer: Alex fronts every bill, Sam owes Alex half.
INSERT INTO households (slug, name, tagline, mode, theme, ask_bill_date,
                        feature_rent, feature_trends, feature_documents, reply_to)
VALUES ('elm-street', '12 Elm Street', 'Utilities, split evenly', 'single_payer', 'statement', true,
        true, true, true, 'alex@example.com');

-- Ledger: each type has its own owner.
INSERT INTO households (slug, name, tagline, mode, theme, ask_bill_date,
                        feature_welcome_tour, reply_to)
VALUES ('oak-lane', '7 Oak Lane', 'Who owes whom', 'ledger', 'peach', false,
        true, 'sam@example.com');

INSERT INTO memberships (household_id, user_id, role, joined_at)
SELECT h.id, u.id, r.role, now()
FROM (VALUES ('elm-street', 'alex@example.com', 'admin'),
             ('elm-street', 'sam@example.com',  'member'),
             ('oak-lane',   'sam@example.com',  'admin'),
             ('oak-lane',   'alex@example.com', 'member')) AS r (slug, email, role)
JOIN households h ON h.slug = r.slug
JOIN users u ON u.email = r.email;

INSERT INTO bill_types (household_id, name, emoji, processing_fee, owner_id)
SELECT h.id, t.name, t.emoji, t.fee, m.id
FROM (VALUES ('elm-street', 'Gas',      '🔥', 0.00, 'alex@example.com'),
             ('elm-street', 'Electric', '⚡', 3.50, 'alex@example.com'),
             ('elm-street', 'Internet', '🛜', 0.00, 'alex@example.com'),
             ('oak-lane',   'Internet', '🛜', 0.00, 'sam@example.com'),
             ('oak-lane',   'Water',    '💧', 0.00, 'alex@example.com')) AS t (slug, name, emoji, fee, owner)
JOIN households h ON h.slug = t.slug
JOIN users u ON u.email = t.owner
JOIN memberships m ON m.household_id = h.id AND m.user_id = u.id;

-- total = amount + fee; per_person_cost = round(total / 2 splitters, 2); status follows debts.
INSERT INTO bills (household_id, type_id, bill_date, due_date, total, per_person_cost, status, added_by_id)
SELECT h.id, bt.id, current_date + b.bill_offset, current_date + b.due_offset,
       b.total, round(b.total / 2, 2), b.status, bt.owner_id
FROM (VALUES ('elm-street', 'Gas',      -40, -20,  84.20, 'paid'),
             ('elm-street', 'Gas',      -10,  12,  61.75, 'unpaid'),
             ('elm-street', 'Electric', -12,   3,  50.33, 'unpaid'),
             ('elm-street', 'Internet',  -5,  20,  70.00, 'unpaid'),
             ('oak-lane',   'Internet',  -8,  10,  65.00, 'unpaid'),
             ('oak-lane',   'Water',    -15,  -2,  42.18, 'unpaid')) AS b (slug, type, bill_offset, due_offset, total, status)
JOIN households h ON h.slug = b.slug
JOIN bill_types bt ON bt.household_id = h.id AND bt.name = b.type;

-- Every splitter except the type's owner has a debt row on every bill (rows are permanent);
-- on the bill that's already paid, each row carries paid_at.
INSERT INTO bill_debts (household_id, bill_id, person_id, paid_at)
SELECT b.household_id, b.id, m.id, CASE WHEN b.status = 'paid' THEN b.due_date - 1 + time '12:00' END
FROM bills b
JOIN households h ON h.id = b.household_id AND h.slug IN ('elm-street', 'oak-lane')
JOIN bill_types bt ON bt.id = b.type_id
JOIN memberships m ON m.household_id = b.household_id AND m.splits_bills AND m.id <> bt.owner_id;

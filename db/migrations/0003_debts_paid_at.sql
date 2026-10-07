-- Phase 3: debt rows are permanent. A bill's debtor set is fixed when the bill is created and
-- never rebuilt; paying sets paid_at, un-paying clears it. A bill is paid when none of its rows
-- has paid_at IS NULL (bills.status is kept in step by setPaid, transactionally). This replaces
-- "delete the row as people pay", which lost who the original debtors were: unchecking had to
-- guess from today's splitters and could add people who joined after the bill.
--
-- Rows that exist today are unpaid by definition (the old model deleted paid ones). Bills that
-- were already paid have no rows and so no debtor history; the phase 6 importer synthesizes
-- paid rows for them (ARCHITECTURE.md §11).

ALTER TABLE bill_debts ADD COLUMN paid_at TIMESTAMPTZ NULL;

-- The hot path: what is still owed, per person and per bill.
CREATE INDEX bill_debts_unpaid ON bill_debts (household_id, person_id) WHERE paid_at IS NULL;
CREATE INDEX bill_debts_bill_unpaid ON bill_debts (bill_id) WHERE paid_at IS NULL;

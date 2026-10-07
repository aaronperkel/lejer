-- Fixing a posted bill (ARCHITECTURE.md §3, "Fixing a posted bill"). A bill can be edited or
-- deleted until someone is marked paid, and its new-bill email waits in a 10-minute queue so a
-- bad post can be fixed before anyone hears about it.
--
-- The split set is frozen at post time: an edit recomputes the figures over the same shares and
-- never consults today's splitters. `shares` is the denominator the bill was split over, and
-- `owner_share` says whether the bill's owner held one of them (an owner who doesn't split
-- bills doesn't). `fee` is the processing fee at post time, so an edit can show the amount
-- that was typed (total − fee).
--
-- The queue lives on the bill row, so deleting a bill cancels its email by definition.
-- notice_kind is 'new' until the first email has gone (notified_at), 'updated' after;
-- notice_extra holds the membership ids an 'updated' email must also reach (debtors and owners
-- from before the edit), so anyone an edit drops from the bill hears about it.

ALTER TABLE bills
  ADD COLUMN fee              NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN shares           SMALLINT      NOT NULL DEFAULT 1 CHECK (shares >= 1),
  ADD COLUMN owner_share      BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN notice_kind      TEXT          NULL CHECK (notice_kind IN ('new', 'updated')),
  ADD COLUMN notice_queued_at TIMESTAMPTZ   NULL,
  ADD COLUMN notice_extra     INTEGER[]     NOT NULL DEFAULT '{}',
  ADD COLUMN notified_at      TIMESTAMPTZ   NULL,
  ADD CONSTRAINT bills_notice_pair CHECK ((notice_kind IS NULL) = (notice_queued_at IS NULL));

-- Backfill, the best record there is. Every existing bill was mailed when it was posted. The
-- fee is the type's current fee (it may have changed since). The share count is read back from
-- the split itself (total / per person), and the owner held a share when there are more shares
-- than debtors.
UPDATE bills b SET
  notified_at = b.created_at,
  fee = LEAST(t.processing_fee, b.total),
  shares = GREATEST(1, CASE
    WHEN b.per_person_cost > 0 THEN round(b.total / b.per_person_cost)::int
    ELSE (SELECT count(*) FROM bill_debts d WHERE d.bill_id = b.id)::int + (b.owner_id IS NOT NULL)::int END)
FROM bill_types t WHERE t.id = b.type_id;

UPDATE bills b SET owner_share = b.owner_id IS NOT NULL
  AND b.shares > (SELECT count(*) FROM bill_debts d WHERE d.bill_id = b.id);

CREATE INDEX bills_notice_queued ON bills (household_id, notice_queued_at) WHERE notice_queued_at IS NOT NULL;

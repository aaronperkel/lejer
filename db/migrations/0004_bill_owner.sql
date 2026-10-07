-- Bills remember who they're owed to. Until now a bill's creditor was its type's *current*
-- owner, so handing a type to someone else moved every old unpaid bill to them (and could make
-- the new owner a debtor on a bill they're now "owed"). The type's owner now only decides who
-- owns *new* bills; posting snapshots it into bills.owner_id.
--
-- had_owner records whether there was an owner at post time, so a bill whose owner was later
-- removed (owner_id SET NULL) reads as "former member", while a bill posted for a type with no
-- owner reads as owed to the house.

ALTER TABLE bills ADD COLUMN owner_id INTEGER NULL;
ALTER TABLE bills ADD COLUMN had_owner BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bills
  ADD CONSTRAINT bills_owner_fk FOREIGN KEY (owner_id, household_id)
  REFERENCES memberships (id, household_id) ON DELETE SET NULL (owner_id);

-- Backfill from the type's current owner: the best record there is for existing rows.
UPDATE bills b SET owner_id = t.owner_id, had_owner = t.owner_id IS NOT NULL
FROM bill_types t WHERE t.id = b.type_id;

CREATE INDEX bills_owner ON bills (household_id, owner_id) WHERE owner_id IS NOT NULL;

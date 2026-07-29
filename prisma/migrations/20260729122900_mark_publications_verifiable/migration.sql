-- Carry the old hardcoded list into the new column.
--
-- «Перевірено» used to be offered for exactly two codes, held in a Set in
-- lib/rating/moderation.ts. The column added in the previous migration defaults
-- to false, so without this backfill every publication already submitted would
-- lose its check box and every tick already made would become unreachable.
--
-- Matching on the code is right in this one place: it is the last moment the
-- code list is still the source of truth. Afterwards the row is, and a new
-- publication indicator built in the template editor can be marked verifiable
-- without touching any code.
UPDATE "ActivityType"
SET "requiresVerification" = true
WHERE "code" IN ('publication_cat_a', 'publication_cat_b');

-- Carry the old rule into the new column.
--
-- Moderation used to be granted by matching the division's name against «ННВ».
-- The flag added in the previous migration defaults to false, so without this
-- backfill every database that already exists would come up with nobody but
-- ADMIN able to moderate — exactly the silent revocation the flag exists to
-- prevent.
--
-- Matching on the name is correct here and only here: this is the last moment
-- at which the name is still the source of truth. Afterwards the flag is.
UPDATE "Division"
SET "canModerateRating" = true
WHERE "name" = 'Навчально-науковий відділ';

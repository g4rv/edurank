-- Hours are always credits x 30 (owner, 2026-10-13) and are derived on read, so the
-- stored column goes. Nothing is lost: every value in it was typed by hand next
-- to the credits it should have followed.
ALTER TABLE "Qualification" DROP COLUMN "hours";

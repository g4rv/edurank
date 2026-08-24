-- StaffStakeLimits: bounds become per-кафедра rather than per-person.
--
-- A сумісник gets a row in two кафедри's grids with a different ceiling in
-- each, so the bound has to know which кафедра it bounds.
--
-- THERE IS NO DELETE IN THIS FILE, ON PURPOSE. An earlier draft dropped rows
-- whose staff has no кафедра on the argument that they should not exist. If
-- the backfill misses a row, SET NOT NULL below fails, the deploy stops, and a
-- person looks at it — nothing is destroyed by a wrong assumption.

ALTER TABLE "StaffStakeLimits" ADD COLUMN "departmentId" TEXT;

UPDATE "StaffStakeLimits" AS l
SET "departmentId" = s."departmentId"
FROM "Staff" AS s
WHERE s."id" = l."staffId"
  AND s."departmentId" IS NOT NULL;

ALTER TABLE "StaffStakeLimits" ALTER COLUMN "departmentId" SET NOT NULL;

DROP INDEX "StaffStakeLimits_staffId_year_key";

CREATE UNIQUE INDEX "StaffStakeLimits_staffId_departmentId_year_key"
  ON "StaffStakeLimits"("staffId", "departmentId", "year");

CREATE INDEX "StaffStakeLimits_departmentId_idx"
  ON "StaffStakeLimits"("departmentId");

ALTER TABLE "StaffStakeLimits"
  ADD CONSTRAINT "StaffStakeLimits_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

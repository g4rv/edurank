-- Archiving a person instead of deleting them.
--
-- Deleting a Staff row cascades their activities and rating entries, closed
-- years included — so removing someone who left erased official numbers that
-- the university considers final. Two ordinary cases made that unacceptable:
-- a person who leaves and comes back should not have five years of history
-- retyped, and someone on декретна відпустка must be out of the current
-- rating while keeping every past result.
--
-- archivedAt is the whole mechanism: out of the active roster, nothing lost.
-- An archived account also cannot sign in (lib/auth.ts).
ALTER TABLE "Staff" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Staff" ADD COLUMN "archiveReason" TEXT;

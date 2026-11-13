-- ROLLBACK of migration 20261113150000_science_shared_file (shared conference files).
-- Restores `ScienceRecordFile.workId` from the link table and removes the new
-- column and table. It REFUSES, changing nothing, if any file is already held by
-- more than one work — a shared file has no single work to go back to; that case
-- needs a person to decide, or a restore from the pre-deploy backup.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "_ScienceRecordFileToScienceWork" GROUP BY "A" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Rollback refused: a file is held by several works. Restore the backup instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM "ScienceRecordFile" f WHERE NOT EXISTS (SELECT 1 FROM "_ScienceRecordFileToScienceWork" l WHERE l."A" = f.id)) THEN
    RAISE EXCEPTION 'Rollback refused: a file has no work. Restore the backup instead.';
  END IF;
END $$;

ALTER TABLE "ScienceRecordFile" ADD COLUMN "workId" TEXT;
UPDATE "ScienceRecordFile" f SET "workId" = l."B" FROM "_ScienceRecordFileToScienceWork" l WHERE l."A" = f.id;
ALTER TABLE "ScienceRecordFile" ALTER COLUMN "workId" SET NOT NULL;
ALTER TABLE "ScienceRecordFile" ADD CONSTRAINT "ScienceRecordFile_workId_fkey" FOREIGN KEY ("workId") REFERENCES "ScienceWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ScienceRecordFile_workId_idx" ON "ScienceRecordFile"("workId");
DROP TABLE "_ScienceRecordFileToScienceWork";
ALTER TABLE "ScienceWorkType" DROP COLUMN "sharedFile";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113150000_science_shared_file';

COMMIT;

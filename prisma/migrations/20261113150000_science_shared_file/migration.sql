-- One stored file may prove several people's works (owner, 2026-11-13): a
-- conference programme lists every presenter and the organisers issue no
-- certificate, so colleagues connect to the ONE stored file instead of uploading
-- it again. `ScienceRecordFile.workId` becomes a many-to-many; the file's hash
-- stays UNIQUE, exactly as before, so nothing can be stored twice.

-- AlterTable
ALTER TABLE "ScienceWorkType" ADD COLUMN     "sharedFile" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "_ScienceRecordFileToScienceWork" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ScienceRecordFileToScienceWork_AB_pkey" PRIMARY KEY ("A","B")
);

-- Every file so far belongs to exactly one work: carry that over BEFORE the
-- column goes. A = ScienceRecordFile.id, B = ScienceWork.id.
INSERT INTO "_ScienceRecordFileToScienceWork" ("A", "B")
SELECT "id", "workId" FROM "ScienceRecordFile";

-- CreateIndex
CREATE INDEX "_ScienceRecordFileToScienceWork_B_index" ON "_ScienceRecordFileToScienceWork"("B");

-- AddForeignKey
ALTER TABLE "_ScienceRecordFileToScienceWork" ADD CONSTRAINT "_ScienceRecordFileToScienceWork_A_fkey" FOREIGN KEY ("A") REFERENCES "ScienceRecordFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ScienceRecordFileToScienceWork" ADD CONSTRAINT "_ScienceRecordFileToScienceWork_B_fkey" FOREIGN KEY ("B") REFERENCES "ScienceWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "ScienceRecordFile" DROP CONSTRAINT "ScienceRecordFile_workId_fkey";

-- DropIndex
DROP INDEX "ScienceRecordFile_workId_idx";

-- AlterTable
ALTER TABLE "ScienceRecordFile" DROP COLUMN "workId";

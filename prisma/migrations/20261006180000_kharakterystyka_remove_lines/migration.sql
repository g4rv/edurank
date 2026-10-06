-- Removing a line from a Характеристика (owner, 2026-10-06): an imported row is
-- hidden rather than deleted, and a rating line is recorded per position.
-- AlterTable
ALTER TABLE "KharakterystykaEntry" ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedBy" TEXT;

-- CreateTable
CREATE TABLE "KharakterystykaRemovedLine" (
    "activityId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "removedBy" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KharakterystykaRemovedLine_pkey" PRIMARY KEY ("activityId","position")
);

-- AddForeignKey
ALTER TABLE "KharakterystykaRemovedLine" ADD CONSTRAINT "KharakterystykaRemovedLine_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;


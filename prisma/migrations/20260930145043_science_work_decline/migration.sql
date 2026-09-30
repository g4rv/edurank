-- AlterTable
ALTER TABLE "ScienceWork" ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "declinedAt" TIMESTAMP(3),
ADD COLUMN     "declinedById" TEXT,
ADD COLUMN     "resubmittedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ScienceWork" ADD CONSTRAINT "ScienceWork_declinedById_fkey" FOREIGN KEY ("declinedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

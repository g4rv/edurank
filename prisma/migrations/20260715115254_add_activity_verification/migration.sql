-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;


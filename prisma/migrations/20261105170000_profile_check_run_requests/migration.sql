-- AlterTable
ALTER TABLE "ProfileCheckRun" ADD COLUMN     "quotaLimit" INTEGER,
ADD COLUMN     "quotaRemaining" INTEGER,
ADD COLUMN     "quotaResetAt" TIMESTAMP(3),
ADD COLUMN     "requests" INTEGER NOT NULL DEFAULT 0;


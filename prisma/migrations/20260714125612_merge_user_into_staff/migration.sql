-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_approvedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_removedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "RatingTemplate" DROP CONSTRAINT "RatingTemplate_closedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_staffId_fkey";

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER',
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "ActivationToken" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivationToken_staffId_key" ON "ActivationToken"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivationToken_tokenHash_key" ON "ActivationToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "ActivationToken" ADD CONSTRAINT "ActivationToken_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingTemplate" ADD CONSTRAINT "RatingTemplate_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "StakeSandbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kstHundredths" INTEGER,
    "values" JSONB NOT NULL DEFAULT '{}',
    "limits" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakeSandbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StakeSandbox_year_idx" ON "StakeSandbox"("year");

-- CreateIndex
CREATE UNIQUE INDEX "StakeSandbox_userId_departmentId_year_key" ON "StakeSandbox"("userId", "departmentId", "year");

-- AddForeignKey
ALTER TABLE "StakeSandbox" ADD CONSTRAINT "StakeSandbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeSandbox" ADD CONSTRAINT "StakeSandbox_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "StudentClaim_staffId_year_studentNameNormalised_specialityId_ke" RENAME TO "StudentClaim_staffId_year_studentNameNormalised_specialityI_key";

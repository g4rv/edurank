-- CreateEnum
CREATE TYPE "ScienceRecordStatus" AS ENUM ('APPROVED', 'REMOVED');

-- CreateTable
CREATE TABLE "ScienceWork" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "workTypeId" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "computedValue" DOUBLE PRECISION NOT NULL,
    "link" TEXT,
    "totalHundredths" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScienceWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScienceRecord" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planRowId" TEXT,
    "hoursHundredths" INTEGER NOT NULL,
    "status" "ScienceRecordStatus" NOT NULL DEFAULT 'APPROVED',
    "removedReason" TEXT,
    "removedByUserId" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScienceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScienceRecordFile" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScienceRecordFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScienceWork_dedupKey_key" ON "ScienceWork"("dedupKey");

-- CreateIndex
CREATE INDEX "ScienceWork_templateId_workTypeId_idx" ON "ScienceWork"("templateId", "workTypeId");

-- CreateIndex
CREATE INDEX "ScienceRecord_planId_idx" ON "ScienceRecord"("planId");

-- CreateIndex
CREATE INDEX "ScienceRecord_workId_idx" ON "ScienceRecord"("workId");

-- CreateIndex
CREATE INDEX "ScienceRecord_templateId_status_idx" ON "ScienceRecord"("templateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ScienceRecord_staffId_workId_key" ON "ScienceRecord"("staffId", "workId");

-- CreateIndex
CREATE UNIQUE INDEX "ScienceRecordFile_objectKey_key" ON "ScienceRecordFile"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScienceRecordFile_sha256_key" ON "ScienceRecordFile"("sha256");

-- CreateIndex
CREATE INDEX "ScienceRecordFile_workId_idx" ON "ScienceRecordFile"("workId");

-- AddForeignKey
ALTER TABLE "ScienceWork" ADD CONSTRAINT "ScienceWork_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SciencePlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceWork" ADD CONSTRAINT "ScienceWork_workTypeId_fkey" FOREIGN KEY ("workTypeId") REFERENCES "ScienceWorkType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceWork" ADD CONSTRAINT "ScienceWork_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceRecord" ADD CONSTRAINT "ScienceRecord_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceRecord" ADD CONSTRAINT "ScienceRecord_workId_fkey" FOREIGN KEY ("workId") REFERENCES "ScienceWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceRecord" ADD CONSTRAINT "ScienceRecord_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SciencePlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceRecord" ADD CONSTRAINT "ScienceRecord_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SciencePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceRecord" ADD CONSTRAINT "ScienceRecord_planRowId_fkey" FOREIGN KEY ("planRowId") REFERENCES "SciencePlanRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceRecord" ADD CONSTRAINT "ScienceRecord_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceRecordFile" ADD CONSTRAINT "ScienceRecordFile_workId_fkey" FOREIGN KEY ("workId") REFERENCES "ScienceWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceRecordFile" ADD CONSTRAINT "ScienceRecordFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

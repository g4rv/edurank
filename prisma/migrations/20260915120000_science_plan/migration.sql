-- CreateEnum
CREATE TYPE "SciencePlanStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ScienceReuse" AS ENUM ('ONCE', 'YEARLY');

-- CreateEnum
CREATE TYPE "ScienceSharing" AS ENUM ('SHARED', 'INDIVIDUAL');

-- CreateTable
CREATE TABLE "SciencePlanTemplate" (
    "id" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "orderRef" TEXT,
    "minHoursPerRate" INTEGER NOT NULL DEFAULT 500,
    "stakeYear" INTEGER NOT NULL,
    "status" "SciencePlanStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SciencePlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScienceWorkType" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "itemNumber" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "evidenceFields" JSONB NOT NULL,
    "scoring" JSONB NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL,
    "unitNote" TEXT,
    "reportingForm" TEXT,
    "reuse" "ScienceReuse" NOT NULL DEFAULT 'ONCE',
    "sharing" "ScienceSharing" NOT NULL DEFAULT 'INDIVIDUAL',
    "identityFields" JSONB NOT NULL DEFAULT '[]',
    "requiresFile" BOOLEAN NOT NULL DEFAULT false,
    "maxPerYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ScienceWorkType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SciencePlan" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "rateHundredths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SciencePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SciencePlanRow" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "workTypeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "plannedHundredths" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SciencePlanRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SciencePlanTemplate_academicYear_key" ON "SciencePlanTemplate"("academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "ScienceWorkType_templateId_code_key" ON "ScienceWorkType"("templateId", "code");

-- CreateIndex
CREATE INDEX "SciencePlan_departmentId_templateId_idx" ON "SciencePlan"("departmentId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "SciencePlan_staffId_departmentId_templateId_key" ON "SciencePlan"("staffId", "departmentId", "templateId");

-- CreateIndex
CREATE INDEX "SciencePlanRow_planId_idx" ON "SciencePlanRow"("planId");

-- AddForeignKey
ALTER TABLE "ScienceWorkType" ADD CONSTRAINT "ScienceWorkType_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SciencePlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SciencePlan" ADD CONSTRAINT "SciencePlan_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SciencePlan" ADD CONSTRAINT "SciencePlan_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SciencePlan" ADD CONSTRAINT "SciencePlan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SciencePlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SciencePlanRow" ADD CONSTRAINT "SciencePlanRow_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SciencePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SciencePlanRow" ADD CONSTRAINT "SciencePlanRow_workTypeId_fkey" FOREIGN KEY ("workTypeId") REFERENCES "ScienceWorkType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "DepartmentIndicatorKind" AS ENUM ('HEADING', 'COUNT', 'CHOICE');
-- CreateTable
CREATE TABLE "DepartmentIndicator" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "itemNumber" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "DepartmentIndicatorKind" NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "options" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DepartmentIndicator_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "DepartmentReport" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "narrative" JSONB NOT NULL DEFAULT '{}',
    "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DepartmentReport_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "DepartmentIndicator_year_order_idx" ON "DepartmentIndicator"("year", "order");
-- CreateIndex
CREATE UNIQUE INDEX "DepartmentIndicator_year_itemNumber_key" ON "DepartmentIndicator"("year", "itemNumber");
-- CreateIndex
CREATE UNIQUE INDEX "DepartmentReport_departmentId_year_key" ON "DepartmentReport"("departmentId", "year");
-- AddForeignKey
ALTER TABLE "DepartmentReport" ADD CONSTRAINT "DepartmentReport_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DepartmentReport" ADD CONSTRAINT "DepartmentReport_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

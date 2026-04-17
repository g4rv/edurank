/*
  Warnings:

  - A unique constraint covering the columns `[headId]` on the table `Department` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[deanId]` on the table `Faculty` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "headId" TEXT;

-- AlterTable
ALTER TABLE "Faculty" ADD COLUMN     "deanId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Department_headId_key" ON "Department"("headId");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_deanId_key" ON "Faculty"("deanId");

-- AddForeignKey
ALTER TABLE "Faculty" ADD CONSTRAINT "Faculty_deanId_fkey" FOREIGN KEY ("deanId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headId_fkey" FOREIGN KEY ("headId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

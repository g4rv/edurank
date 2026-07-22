/*
  Warnings:

  - Added the required column `evidenceFields` to the `ActivityType` table without a default value. This is not possible if the table is not empty.
  - Added the required column `itemNumber` to the `ActivityType` table without a default value. This is not possible if the table is not empty.
  - Added the required column `scoring` to the `ActivityType` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ActivityType" ADD COLUMN     "evidenceFields" JSONB NOT NULL,
ADD COLUMN     "itemNumber" TEXT NOT NULL,
ADD COLUMN     "maxPerYear" INTEGER,
ADD COLUMN     "scoring" JSONB NOT NULL;

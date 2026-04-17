/*
  Warnings:

  - You are about to drop the column `googleScholarCount` on the `Professor` table. All the data in the column will be lost.
  - You are about to drop the column `googleScholarProfile` on the `Professor` table. All the data in the column will be lost.
  - You are about to drop the column `scopusProfile` on the `Professor` table. All the data in the column will be lost.
  - You are about to drop the column `wosProfile` on the `Professor` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Professor" DROP COLUMN "googleScholarCount",
DROP COLUMN "googleScholarProfile",
DROP COLUMN "scopusProfile",
DROP COLUMN "wosProfile",
ADD COLUMN     "googleScholarCitationCount" INTEGER DEFAULT 0,
ADD COLUMN     "googleScholarURL" TEXT,
ADD COLUMN     "scopusURL" TEXT,
ADD COLUMN     "wosURL" TEXT;

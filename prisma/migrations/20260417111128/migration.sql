/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Professor` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AcademicRank" AS ENUM ('DOCENT', 'PROFESSOR', 'SENIOR_RESEARCHER');

-- CreateEnum
CREATE TYPE "AcademicPosition" AS ENUM ('ASSISTANT', 'LECTURER', 'SENIOR_LECTURER', 'DOCENT', 'PROFESSOR');

-- CreateEnum
CREATE TYPE "ScientificDegree" AS ENUM ('CANDIDATE', 'DOCTOR');

-- AlterTable
ALTER TABLE "Professor" ADD COLUMN     "academicPosition" "AcademicPosition",
ADD COLUMN     "academicRank" "AcademicRank",
ADD COLUMN     "certificateId" TEXT,
ADD COLUMN     "degreeMatchesDepartment" BOOLEAN,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "employmentRate" DOUBLE PRECISION,
ADD COLUMN     "googleScholarCount" INTEGER DEFAULT 0,
ADD COLUMN     "googleScholarProfile" TEXT,
ADD COLUMN     "lastAccessVerified" TIMESTAMP(3),
ADD COLUMN     "orcidId" TEXT,
ADD COLUMN     "pedagogicalExperience" INTEGER,
ADD COLUMN     "ratingSheetId" TEXT,
ADD COLUMN     "scientificDegree" "ScientificDegree",
ADD COLUMN     "scopusCitationCount" INTEGER DEFAULT 0,
ADD COLUMN     "scopusProfile" TEXT,
ADD COLUMN     "wosCitationCount" INTEGER DEFAULT 0,
ADD COLUMN     "wosProfile" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Professor_email_key" ON "Professor"("email");

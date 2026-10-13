-- CreateEnum
CREATE TYPE "QualificationKind" AS ENUM ('TRAINING', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "QualificationDocumentType" AS ENUM ('REFERENCE', 'CERTIFICATE', 'DIPLOMA');

-- AlterTable
ALTER TABLE "Division" ADD COLUMN     "canViewQualifications" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "kind" "QualificationKind" NOT NULL,
    "institution" TEXT NOT NULL,
    "documentType" "QualificationDocumentType" NOT NULL,
    "series" TEXT,
    "number" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "creditsHundredths" INTEGER NOT NULL,
    "hours" INTEGER NOT NULL,
    "fileKey" TEXT,
    "fileName" TEXT,
    "fileContentType" TEXT,
    "fileSizeBytes" INTEGER,
    "fileSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_fileKey_key" ON "Qualification"("fileKey");

-- CreateIndex
CREATE INDEX "Qualification_staffId_issuedOn_idx" ON "Qualification"("staffId", "issuedOn");

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

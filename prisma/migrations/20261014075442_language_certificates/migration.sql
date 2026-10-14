-- CreateEnum
CREATE TYPE "LanguageCertificateKind" AS ENUM ('ENGLISH', 'UKRAINIAN');

-- CreateTable
CREATE TABLE "LanguageCertificate" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "kind" "LanguageCertificateKind" NOT NULL,
    "series" TEXT,
    "number" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "issuedBy" TEXT,
    "level" TEXT,
    "decisionNumber" TEXT,
    "decisionDate" DATE,
    "fileKey" TEXT,
    "fileName" TEXT,
    "fileContentType" TEXT,
    "fileSizeBytes" INTEGER,
    "fileSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LanguageCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LanguageCertificate_fileKey_key" ON "LanguageCertificate"("fileKey");

-- CreateIndex
CREATE UNIQUE INDEX "LanguageCertificate_staffId_kind_key" ON "LanguageCertificate"("staffId", "kind");

-- AddForeignKey
ALTER TABLE "LanguageCertificate" ADD CONSTRAINT "LanguageCertificate_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

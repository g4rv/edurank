-- The scan of a кандидат / доктор diploma (owner, 2026-10-27): optional, JPG
-- only. Five empty columns on a live table — no row is touched.
ALTER TABLE "Diploma" ADD COLUMN "fileKey" TEXT;
ALTER TABLE "Diploma" ADD COLUMN "fileName" TEXT;
ALTER TABLE "Diploma" ADD COLUMN "fileContentType" TEXT;
ALTER TABLE "Diploma" ADD COLUMN "fileSizeBytes" INTEGER;
ALTER TABLE "Diploma" ADD COLUMN "fileSha256" TEXT;

CREATE UNIQUE INDEX "Diploma_fileKey_key" ON "Diploma"("fileKey");

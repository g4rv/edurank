-- Заступник завідувача кафедри з наукової роботи (2026-10-21) — fills Рейтинг кафедри
ALTER TABLE "Department" ADD COLUMN "scienceDeputyId" TEXT;

ALTER TABLE "Department" ADD CONSTRAINT "Department_scienceDeputyId_fkey" FOREIGN KEY ("scienceDeputyId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- D42: how many months back a work may be entered, per year.
ALTER TABLE "SciencePlanTemplate" ADD COLUMN "maxLookbackMonths" INTEGER NOT NULL DEFAULT 12;

-- D41: existing works have no month. The month they were ENTERED is the best
-- honest guess, read in Kyiv like everything else here; the person can correct
-- it in «Редагувати».
ALTER TABLE "ScienceWork" ADD COLUMN "executedMonth" DATE;
UPDATE "ScienceWork"
SET "executedMonth" = date_trunc('month', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Kyiv')::date;
ALTER TABLE "ScienceWork" ALTER COLUMN "executedMonth" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ScienceWork_templateId_executedMonth_idx" ON "ScienceWork"("templateId", "executedMonth");

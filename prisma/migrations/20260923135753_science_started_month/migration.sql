-- D48: the year's execution window ends in this month of its second calendar
-- year — Червень by the owner (2026-09-23).
ALTER TABLE "SciencePlanTemplate" ADD COLUMN "lastExecutionMonth" INTEGER NOT NULL DEFAULT 6;

-- «Робота тривала кілька місяців»: the month a work started. Informational —
-- its hours all count in "executedMonth", the month it was finished.
ALTER TABLE "ScienceWork" ADD COLUMN "startedMonth" DATE;

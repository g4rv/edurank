-- «Відмітити як уже списану» (owner, 2026-10-27): a co-author's share that
-- counts nowhere, with no date window.
ALTER TABLE "ScienceCoauthorShare" ADD COLUMN "writtenOffAt" TIMESTAMP(3);

-- The old «Вже зараховано у 2025/2026» marks were a share moved to a рік BEFORE
-- its work's own — the same meaning, so they become the new mark. A share
-- moved to a LATER рік is a deferral and is left alone.
UPDATE "ScienceCoauthorShare" AS s
SET "writtenOffAt" = s."updatedAt", "academicYear" = NULL
FROM "ScienceWork" AS w
JOIN "SciencePlanTemplate" AS t ON t."id" = w."templateId"
WHERE w."id" = s."workId"
  AND s."academicYear" IS NOT NULL
  AND s."academicYear" < t."academicYear";

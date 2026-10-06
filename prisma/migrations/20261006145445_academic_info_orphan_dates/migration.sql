-- A defence date with no degree beside it (none on the 2026-09-26 copy, but
-- production may have one since): keep it in the candidate slot, so the
-- `degreeDefenceDate` mirror — Характеристика п.5 — derives the same date.
UPDATE "Staff" SET "candidateDefenceDate" = "degreeDefenceDate"
WHERE "degreeDefenceDate" IS NOT NULL
  AND "scientificDegree" IS NULL
  AND "candidateDefenceDate" IS NULL
  AND "doctorDefenceDate" IS NULL;

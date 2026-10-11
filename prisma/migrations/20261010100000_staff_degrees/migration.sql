-- Дипломи про науковий ступінь as a list (owner, 2026-10-10).
--
-- The two slots (доктор, кандидат / PhD) become records in one list. The old
-- columns stay: they are now the mirrors of the list's best doctor-level and
-- best candidate-level record, so the rating and every list read what they
-- always read.

ALTER TABLE "Staff" ADD COLUMN "degrees" JSONB NOT NULL DEFAULT '[]';

-- Carry each person's existing degrees over, доктор first. A slot with no degree
-- chosen carries nothing: a speciality or a date with no ступінь was never read
-- by anything.
UPDATE "Staff"
SET "degrees" = (
  SELECT COALESCE(jsonb_agg(x.d ORDER BY x.ord), '[]'::jsonb)
  FROM (
    SELECT 1 AS ord,
           jsonb_build_object(
             'degree', "Staff"."doctorDegree",
             'specialty', "Staff"."doctorSpecialty",
             'defenceDate', to_char("Staff"."doctorDefenceDate", 'YYYY-MM-DD'),
             'matchesDepartment', "Staff"."doctorMatchesDepartment"
           ) AS d
    WHERE "Staff"."doctorDegree" IS NOT NULL
    UNION ALL
    SELECT 2,
           jsonb_build_object(
             'degree', "Staff"."candidateDegree",
             'specialty', "Staff"."candidateSpecialty",
             'defenceDate', to_char("Staff"."candidateDefenceDate", 'YYYY-MM-DD'),
             'matchesDepartment', "Staff"."candidateMatchesDepartment"
           )
    WHERE "Staff"."candidateDegree" IS NOT NULL
  ) AS x
)
WHERE "doctorDegree" IS NOT NULL OR "candidateDegree" IS NOT NULL;

-- A division that could edit any of the eight degree fields can edit the list.
INSERT INTO "DivisionFieldPermission" ("id", "divisionId", "fieldName")
SELECT 'degrees_' || "divisionId", "divisionId", 'degrees'
FROM "DivisionFieldPermission"
WHERE "fieldName" IN (
  'candidateDegree', 'candidateSpecialty', 'candidateDefenceDate', 'candidateMatchesDepartment',
  'doctorDegree', 'doctorSpecialty', 'doctorDefenceDate', 'doctorMatchesDepartment'
)
GROUP BY "divisionId"
ON CONFLICT ("divisionId", "fieldName") DO NOTHING;

DELETE FROM "DivisionFieldPermission"
WHERE "fieldName" IN (
  'candidateDegree', 'candidateSpecialty', 'candidateDefenceDate', 'candidateMatchesDepartment',
  'doctorDegree', 'doctorSpecialty', 'doctorDefenceDate', 'doctorMatchesDepartment'
);

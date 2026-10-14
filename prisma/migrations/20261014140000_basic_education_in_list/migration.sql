-- Базова освіта as entries of the education list (owner, 2026-10-14).
--
-- A person may hold several (a бакалавр and a магістр, two магістр), so the basic
-- education joins `Staff.degrees` beside the diplomas. The two old columns stay:
-- they are now the MIRRORS of the list's basic-education entries, written on every
-- save, so rating 1.9 reads exactly what it always read and no point moves.

-- Carry each person's one saved basic education over as one entry. Its type
-- (бакалавр / магістр / спеціаліст) was never recorded, and is not told apart now:
-- the entry is plain «Базова освіта», with no date until the person adds one.
-- Anybody who already has a basic entry is left alone, so this can be re-run.
UPDATE "Staff"
SET "degrees" = "degrees" || jsonb_build_array(
  jsonb_build_object(
    'degree', 'basic_education',
    'specialty', NULLIF(btrim("basicEducationSpecialty"), ''),
    'defenceDate', NULL::text,
    'matchesDepartment', "basicEducationMatch"
  )
)
WHERE (
    "basicEducationMatch" IS NOT NULL
    OR NULLIF(btrim("basicEducationSpecialty"), '') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("degrees") AS entry
    WHERE entry ->> 'degree' LIKE 'basic\_%'
  );

-- A division that could edit either basic-education field can edit the list, as it
-- did when the degree fields became the list (20261010100000_staff_degrees).
INSERT INTO "DivisionFieldPermission" ("id", "divisionId", "fieldName")
SELECT 'degrees_' || "divisionId", "divisionId", 'degrees'
FROM "DivisionFieldPermission"
WHERE "fieldName" IN ('basicEducationMatch', 'basicEducationSpecialty')
GROUP BY "divisionId"
ON CONFLICT ("divisionId", "fieldName") DO NOTHING;

DELETE FROM "DivisionFieldPermission"
WHERE "fieldName" IN ('basicEducationMatch', 'basicEducationSpecialty');

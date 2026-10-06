-- «Ступінь відповідає кафедрі» per degree (owner, 2026-10-06). The single
-- answer moves into the slot of the degree it was given for — the highest one,
-- which is the one rating 1.3 pays — and stays as a mirror of that slot.
ALTER TABLE "Staff" ADD COLUMN "candidateMatchesDepartment" BOOLEAN,
ADD COLUMN "doctorMatchesDepartment" BOOLEAN;

UPDATE "Staff" SET "doctorMatchesDepartment" = "degreeMatchesDepartment"
WHERE "doctorDegree" IS NOT NULL;

UPDATE "Staff" SET "candidateMatchesDepartment" = "degreeMatchesDepartment"
WHERE "doctorDegree" IS NULL AND "candidateDegree" IS NOT NULL;

-- A division granted the old field keeps the same power over both new ones.
INSERT INTO "DivisionFieldPermission" ("id", "divisionId", "fieldName")
SELECT gen_random_uuid()::text, p."divisionId", n."fieldName"
FROM "DivisionFieldPermission" p
JOIN (VALUES
  ('degreeMatchesDepartment', 'candidateMatchesDepartment'),
  ('degreeMatchesDepartment', 'doctorMatchesDepartment')
) AS n("oldName", "fieldName") ON n."oldName" = p."fieldName"
ON CONFLICT ("divisionId", "fieldName") DO NOTHING;

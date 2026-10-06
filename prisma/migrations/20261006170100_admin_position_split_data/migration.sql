-- 1. Every split post starts at the price its combined post had (owner,
--    2026-10-06: a separate price per post). ADMIN changes them from there.
INSERT INTO "StakeStatusBonus" ("id", "year", "position", "valueHundredths", "updatedAt")
SELECT gen_random_uuid()::text, b."year", m."to"::"AdminPosition", b."valueHundredths", now()
FROM "StakeStatusBonus" b
JOIN (VALUES
  ('VICE_DEAN', 'ACADEMIC_SECRETARY'),
  ('VICE_DEAN', 'ADMISSION_SECRETARY'),
  ('DEPARTMENT_HEAD', 'UNIT_HEAD'),
  ('LAB_HEAD', 'CENTER_HEAD')
) AS m("from", "to") ON b."position"::text = m."from"
ON CONFLICT ("year", "position") DO NOTHING;

-- 2. A picked «завідувач кафедри / керівник відділу». The кафедра's head is
--    now made by Department.headId alone, so on a head the pick is dropped; on
--    anybody else it can only have meant a відділ.
UPDATE "Staff"
SET "adminPositions" = array_replace("adminPositions", 'DEPARTMENT_HEAD', 'UNIT_HEAD'),
    "adminPosition" = CASE WHEN "adminPosition" = 'DEPARTMENT_HEAD' THEN 'UNIT_HEAD'::"AdminPosition" ELSE "adminPosition" END
WHERE 'DEPARTMENT_HEAD' = ANY("adminPositions")
  AND "id" NOT IN (SELECT "headId" FROM "Department" WHERE "headId" IS NOT NULL);

UPDATE "Staff" s
SET "adminPositions" = array_remove(s."adminPositions", 'DEPARTMENT_HEAD'),
    -- the legacy mirror: the highest post still picked, in rating 1.6 order
    "adminPosition" = (
      SELECT p FROM unnest(array_remove(s."adminPositions", 'DEPARTMENT_HEAD')) AS p
      ORDER BY array_position(ARRAY[
        'VICE_RECTOR', 'DEAN', 'DEPARTMENT_HEAD', 'UNIT_HEAD', 'VICE_DEAN',
        'ACADEMIC_SECRETARY', 'ADMISSION_SECRETARY', 'DEPUTY_DEPARTMENT_HEAD',
        'DEPUTY_ADMISSION_SECRETARY', 'LAB_HEAD', 'CENTER_HEAD'
      ]::"AdminPosition"[], p)
      LIMIT 1
    )
WHERE 'DEPARTMENT_HEAD' = ANY(s."adminPositions")
  AND s."id" IN (SELECT "headId" FROM "Department" WHERE "headId" IS NOT NULL);

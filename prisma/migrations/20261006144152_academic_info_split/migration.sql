-- Academic info split and «Освіта» (owner, 2026-10-06).
-- Additive only: new columns, every existing value copied into them. The old
-- columns (academicRank, scientificDegree, degreeDefenceDate, adminPosition)
-- stay and become mirrors the app keeps in step — nothing is dropped here.

-- CreateEnum
CREATE TYPE "StaffPosition" AS ENUM ('LECTURER', 'SENIOR_LECTURER', 'DOCENT', 'PROFESSOR');

-- CreateEnum
CREATE TYPE "AcademicTitle" AS ENUM ('SENIOR_RESEARCHER', 'DOCENT', 'PROFESSOR');

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "academicTitle" "AcademicTitle",
ADD COLUMN     "adminPositions" "AdminPosition"[] DEFAULT ARRAY[]::"AdminPosition"[],
ADD COLUMN     "candidateDefenceDate" TIMESTAMP(3),
ADD COLUMN     "candidateDegree" TEXT,
ADD COLUMN     "candidateSpecialty" TEXT,
ADD COLUMN     "doctorDefenceDate" TIMESTAMP(3),
ADD COLUMN     "doctorDegree" TEXT,
ADD COLUMN     "doctorSpecialty" TEXT,
ADD COLUMN     "honoraryTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "position" "StaffPosition";

-- Посада = exactly what «вчене звання» held (same four values).
UPDATE "Staff" SET "position" = "academicRank"::text::"StaffPosition"
WHERE "academicRank" IS NOT NULL;

-- Вчене звання proper, pre-filled where the old value is also a звання.
UPDATE "Staff" SET "academicTitle" = "academicRank"::text::"AcademicTitle"
WHERE "academicRank" IN ('DOCENT', 'PROFESSOR');

-- The single administrative position becomes the first badge.
UPDATE "Staff" SET "adminPositions" = ARRAY["adminPosition"]
WHERE "adminPosition" IS NOT NULL;

-- A degree with no branch of science yet: the level is kept with the
-- «уточніть галузь» key, and the defence date moves into its slot.
UPDATE "Staff" SET "candidateDegree" = 'candidate_unspecified',
                   "candidateDefenceDate" = "degreeDefenceDate"
WHERE "scientificDegree" = 'CANDIDATE';

UPDATE "Staff" SET "doctorDegree" = 'doctor_unspecified',
                   "doctorDefenceDate" = "degreeDefenceDate"
WHERE "scientificDegree" = 'DOCTOR';

-- A division granted an old field keeps the same power over its new fields.
INSERT INTO "DivisionFieldPermission" ("id", "divisionId", "fieldName")
SELECT gen_random_uuid()::text, p."divisionId", n."fieldName"
FROM "DivisionFieldPermission" p
JOIN (VALUES
  ('academicRank', 'position'),
  ('academicRank', 'academicTitle'),
  ('academicRank', 'honoraryTitles'),
  ('adminPosition', 'adminPositions'),
  ('scientificDegree', 'candidateDegree'),
  ('scientificDegree', 'candidateSpecialty'),
  ('scientificDegree', 'doctorDegree'),
  ('scientificDegree', 'doctorSpecialty'),
  ('degreeDefenceDate', 'candidateDefenceDate'),
  ('degreeDefenceDate', 'doctorDefenceDate')
) AS n("oldName", "fieldName") ON n."oldName" = p."fieldName"
ON CONFLICT ("divisionId", "fieldName") DO NOTHING;

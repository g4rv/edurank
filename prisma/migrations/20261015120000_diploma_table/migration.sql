-- «Освіта» as a table (owner, 2026-10-15). The diplomas were a JSON list on
-- `Staff.degrees` (20261010100000_staff_degrees, 20261014140000_basic_education_in_list);
-- each entry of it becomes one `Diploma` row, in the person's own order, and the
-- column is dropped. The mirror columns on `Staff` are not touched: they were
-- written from the same list, so the rating reads exactly what it read.

-- CreateTable
CREATE TABLE "Diploma" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "degree" TEXT NOT NULL,
    "specialty" TEXT,
    "defenceDate" DATE,
    "matchesDepartment" BOOLEAN,
    "issuedBy" TEXT,
    "series" TEXT,
    "number" TEXT,
    "issueDate" DATE,
    "basicLevel" TEXT,
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diploma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Diploma_staffId_position_idx" ON "Diploma"("staffId", "position");

-- AddForeignKey
ALTER TABLE "Diploma" ADD CONSTRAINT "Diploma_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry the list over. The app reads it defensively (`asDegreeRecords`), so the
-- copy does the same: an entry with no degree is skipped, an empty string is
-- NULL, a date that is not «YYYY-MM-DD» is NULL rather than a failed migration.
INSERT INTO "Diploma" (
  "id", "staffId", "position", "degree", "specialty", "defenceDate", "matchesDepartment",
  "issuedBy", "series", "number", "issueDate", "basicLevel", "topic", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  s."id",
  (e.ord - 1)::int,
  e.item ->> 'degree',
  NULLIF(e.item ->> 'specialty', ''),
  CASE WHEN e.item ->> 'defenceDate' ~ '^\d{4}-\d{2}-\d{2}$'
       THEN (e.item ->> 'defenceDate')::date END,
  CASE WHEN jsonb_typeof(e.item -> 'matchesDepartment') = 'boolean'
       THEN (e.item ->> 'matchesDepartment')::boolean END,
  NULLIF(e.item ->> 'issuedBy', ''),
  NULLIF(e.item ->> 'series', ''),
  NULLIF(e.item ->> 'number', ''),
  CASE WHEN e.item ->> 'issueDate' ~ '^\d{4}-\d{2}-\d{2}$'
       THEN (e.item ->> 'issueDate')::date END,
  NULLIF(e.item ->> 'basicLevel', ''),
  NULLIF(e.item ->> 'topic', ''),
  CURRENT_TIMESTAMP
FROM "Staff" s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s."degrees") = 'array' THEN s."degrees" ELSE '[]'::jsonb END
) WITH ORDINALITY AS e(item, ord)
WHERE jsonb_typeof(e.item) = 'object'
  AND COALESCE(e.item ->> 'degree', '') <> '';

-- AlterTable
ALTER TABLE "Staff" DROP COLUMN "degrees";

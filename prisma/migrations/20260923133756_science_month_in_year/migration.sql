-- D48 (owner, 2026-09-23): the execution month is fenced by the навчальний рік
-- itself, so the per-year «how many months back» setting has no job left.
ALTER TABLE "SciencePlanTemplate" DROP COLUMN "maxLookbackMonths";

-- D48: a стаття carries its publication date as an ORDINARY evidence field —
-- shown to ННВ, who check it against the linked page by eye. No automatic
-- refusal, and it is not one of the type's identityFields, so a typed date can
-- never make the same article look like a new one. Every template, because a
-- cloned year carries its own catalogue and production is never reseeded.
UPDATE "ScienceWorkType"
SET "evidenceFields" = "evidenceFields"
  || '[{"kind": "date", "name": "publishedOn", "label": "Дата публікації"}]'::jsonb
WHERE "code" = 'article'
  AND NOT "evidenceFields" @> '[{"name": "publishedOn"}]'::jsonb;

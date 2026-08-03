-- Which indicators offer the bulk entity-first dialog on /division-data.
--
-- This was a hardcoded list of 17 codes (ENTITY_FIRST_CODES). An admin who
-- builds a new project- or council-shaped indicator in the template editor got
-- no bulk path and no explanation, and renaming a code silently lost it — the
-- same defect already fixed for «Перевірено» with requiresVerification.
ALTER TABLE "ActivityType" ADD COLUMN "entityFirstEntry" BOOLEAN NOT NULL DEFAULT false;

-- Carry the current list over, for every year that holds these indicators.
UPDATE "ActivityType" SET "entityFirstEntry" = true WHERE "code" IN (
  -- ВМЗ — міжнародні проєкти
  'intl_grant_won',
  'intl_program_participation',
  'intl_grant_application',
  -- ННВ — НДР-теми, конкурси, видання
  'ukr_grant_application',
  'ndr_execution',
  'journal_editorial_a',
  'journal_editorial_b',
  -- ННЦЗЯО — освітні програми, плани, ради
  'accreditation_self_analysis',
  'edu_program_development',
  'edu_program_update',
  'curriculum_development',
  'curriculum_update',
  'accreditation_expert_meeting',
  'university_councils',
  'subject_committee',
  -- ВА — спецради
  'specialized_council'
);

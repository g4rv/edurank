-- D47 (owner, 2026-09-23): the link and the file are two separate proofs, each
-- with its own rule. The data moves BEFORE the old column is dropped.

-- CreateEnum
CREATE TYPE "ProofRule" AS ENUM ('REQUIRED', 'OPTIONAL', 'NONE');

-- AlterTable
ALTER TABLE "ScienceWorkType"
  ADD COLUMN "linkRule" "ProofRule" NOT NULL DEFAULT 'OPTIONAL',
  ADD COLUMN "fileRule" "ProofRule" NOT NULL DEFAULT 'OPTIONAL';

-- The old flag meant «a link alone is not enough».
UPDATE "ScienceWorkType" SET "fileRule" = 'REQUIRED' WHERE "requiresFile" = true;

-- D39: the eight types whose proof is a large or published document, in EVERY
-- template — a cloned year carries its own catalogue and production is never
-- reseeded. Reviewed type by type with the owner.
UPDATE "ScienceWorkType" SET "linkRule" = 'REQUIRED', "fileRule" = 'NONE'
WHERE "code" IN (
  'intl_grant_program', 'intl_project', 'monograph', 'monograph_reissue', 'article',
  'conference_paper', 'editorial_board', 'english_support'
);

ALTER TABLE "ScienceWorkType" DROP COLUMN "requiresFile";

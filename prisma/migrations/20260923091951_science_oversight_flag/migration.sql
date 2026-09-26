-- AlterTable
ALTER TABLE "Division" ADD COLUMN     "canOverseeScience" BOOLEAN NOT NULL DEFAULT false;

-- D43: the right used to be hard-coded to ННВ by registryKey. Carry it over so
-- nobody loses access on deploy.
UPDATE "Division" SET "canOverseeScience" = true WHERE "registryKey" = 'NNV';

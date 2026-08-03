-- Stable identity for the divisions the 2026 rating catalogue knows about.
--
-- Two runtime paths looked a Division up by its display name: re-adding a
-- catalogue indicator (addActivityType) and the «Дані внесені» column of the
-- Excel export. `name` is editable on /divisions, so renaming ННВ attached the
-- re-added indicator to no division at all — leaving it permanently
-- unenterable — and silently blanked the export column. Same defect the
-- moderation flag already fixed for canModerateRating.
--
-- Null for divisions an admin creates: they are not part of the catalogue.
ALTER TABLE "Division" ADD COLUMN "registryKey" TEXT;

CREATE UNIQUE INDEX "Division_registryKey_key" ON "Division"("registryKey");

-- Backfill from the names the seed wrote. Matching on a display name is only
-- ever correct once — here, at the moment the stable key is introduced.
UPDATE "Division" SET "registryKey" = 'KADRY' WHERE "name" = 'Відділ кадрів';
UPDATE "Division" SET "registryKey" = 'NAVCH' WHERE "name" = 'Навчальний відділ';
UPDATE "Division" SET "registryKey" = 'NNV' WHERE "name" = 'Навчально-науковий відділ';
UPDATE "Division" SET "registryKey" = 'NNCZYAO' WHERE "name" = 'Навчально-науковий центр забезпечення якості освіти';
UPDATE "Division" SET "registryKey" = 'VMZ' WHERE "name" = 'Відділ міжнародних зв''язків';
UPDATE "Division" SET "registryKey" = 'VA' WHERE "name" = 'Відділ аспірантури';

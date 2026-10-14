-- A qualification document may carry no number (owner, 2026-10-14), and may point
-- at a copy on the web.
ALTER TABLE "Qualification" ALTER COLUMN "number" DROP NOT NULL;
ALTER TABLE "Qualification" ADD COLUMN "url" TEXT;

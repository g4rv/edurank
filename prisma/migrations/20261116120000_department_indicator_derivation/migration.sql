-- Рейтинг кафедри: which personal-rating entries a line can be counted from
-- (owner, 2026-11-16). Null = the line is typed by hand, as before, so every
-- existing row keeps working. `pnpm db:department-rating-derivation` fills it.

-- AlterTable
ALTER TABLE "DepartmentIndicator" ADD COLUMN     "derivation" JSONB;

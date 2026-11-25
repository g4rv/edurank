-- The pages a division's editors open (owner, 2026-11-25). Every editor opened
-- Штат, Кафедри, Факультети, Рейтинг НПП and Графіки by role before; each is a
-- switch now, off for every division. A right used from a page still opens it
-- (computed in code, not stored), so a division keeps what its rights need.

-- AlterTable
ALTER TABLE "Division" ADD COLUMN     "canViewStaff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewDepartments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewFaculties" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewRating" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewCharts" BOOLEAN NOT NULL DEFAULT false;

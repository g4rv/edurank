-- One value per real post (owner, 2026-10-06). The three combined values keep
-- their rows under the first post they named; the posts they also named are
-- new values. Renaming, not recreating the type, so every stored value stays.
--
-- Copying data into the NEW values is the next migration: PostgreSQL refuses a
-- value added in the same transaction («unsafe use of new value»).
ALTER TYPE "AdminPosition" RENAME VALUE 'VICE_DEAN_OR_SECRETARY' TO 'VICE_DEAN';
ALTER TYPE "AdminPosition" RENAME VALUE 'DEPARTMENT_OR_UNIT_HEAD' TO 'DEPARTMENT_HEAD';
ALTER TYPE "AdminPosition" RENAME VALUE 'LAB_OR_CENTER_HEAD' TO 'LAB_HEAD';
ALTER TYPE "AdminPosition" ADD VALUE 'ACADEMIC_SECRETARY' AFTER 'VICE_DEAN';
ALTER TYPE "AdminPosition" ADD VALUE 'ADMISSION_SECRETARY' AFTER 'ACADEMIC_SECRETARY';
ALTER TYPE "AdminPosition" ADD VALUE 'UNIT_HEAD' AFTER 'DEPARTMENT_HEAD';
ALTER TYPE "AdminPosition" ADD VALUE 'CENTER_HEAD' AFTER 'LAB_HEAD';

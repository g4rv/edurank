-- CreateEnum
CREATE TYPE "AdminPosition" AS ENUM ('VICE_RECTOR', 'DEAN', 'VICE_DEAN_OR_SECRETARY', 'DEPARTMENT_OR_UNIT_HEAD', 'DEPUTY_DEPARTMENT_HEAD', 'DEPUTY_ADMISSION_SECRETARY', 'LAB_OR_CENTER_HEAD');

-- AlterEnum
ALTER TYPE "InputSource" ADD VALUE 'PROFILE_DERIVED';

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "adminPosition" "AdminPosition",
ADD COLUMN     "basicEducationMatch" BOOLEAN,
ADD COLUMN     "basicEducationSpecialty" TEXT;

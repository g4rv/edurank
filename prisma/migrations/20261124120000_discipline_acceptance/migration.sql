-- A moderator may count an assigned discipline for a person without an entry
-- behind it (owner, 2026-11-24): the departments' list is often wrong. Null =
-- not accepted; every existing row stays as it is.

-- AlterTable
ALTER TABLE "AssignedDiscipline" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedById" TEXT;

-- AddForeignKey
ALTER TABLE "AssignedDiscipline" ADD CONSTRAINT "AssignedDiscipline_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

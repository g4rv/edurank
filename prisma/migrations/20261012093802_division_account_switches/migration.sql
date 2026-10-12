-- AlterTable
ALTER TABLE "Division" ADD COLUMN     "canEndSessions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canInviteStaff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSetPasswords" BOOLEAN NOT NULL DEFAULT false;

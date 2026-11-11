-- The freezes as switches on /admin/freeze instead of constants and a redeploy
-- (owner, 2026-11-11): one settings row, always id 'default', and the ADMIN's
-- whitelist of people every freeze leaves alone. The row is created here with
-- every switch OFF — the constants it replaces were all false on this date.

-- CreateTable
CREATE TABLE "FreezeSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "allFrozen" BOOLEAN NOT NULL DEFAULT false,
    "kharakterystykaFrozen" BOOLEAN NOT NULL DEFAULT false,
    "linkedRatingFrozen" BOOLEAN NOT NULL DEFAULT false,
    "profileFrozen" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "FreezeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreezeExemption" (
    "staffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "FreezeExemption_pkey" PRIMARY KEY ("staffId")
);

-- AddForeignKey
ALTER TABLE "FreezeSettings" ADD CONSTRAINT "FreezeSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreezeExemption" ADD CONSTRAINT "FreezeExemption_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreezeExemption" ADD CONSTRAINT "FreezeExemption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The one row the app reads. Never deleted; the page only updates it.
INSERT INTO "FreezeSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockLevel" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginThrottle_subject_key" ON "LoginThrottle"("subject");

-- CreateIndex
CREATE INDEX "LoginThrottle_updatedAt_idx" ON "LoginThrottle"("updatedAt");

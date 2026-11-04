-- CreateEnum
CREATE TYPE "ProfileCheckRunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "ProfileCheckRun" (
    "id" TEXT NOT NULL,
    "status" "ProfileCheckRunStatus" NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL,
    "done" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "startedById" TEXT,

    CONSTRAINT "ProfileCheckRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileCheck" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "link" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "checks" JSONB NOT NULL DEFAULT '[]',
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileCheckRun_startedAt_idx" ON "ProfileCheckRun"("startedAt");

-- CreateIndex
CREATE INDEX "ProfileCheck_status_idx" ON "ProfileCheck"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileCheck_staffId_platform_key" ON "ProfileCheck"("staffId", "platform");

-- AddForeignKey
ALTER TABLE "ProfileCheckRun" ADD CONSTRAINT "ProfileCheckRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileCheck" ADD CONSTRAINT "ProfileCheck_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The distribution itself: one row per кафедра per year, one allocation per НПП.
--
-- There is NO approval step (decided 2026-08-10, retracting Q1 of 2026-08-04).
-- ADMIN sets the pool, the завідувач spreads it, and what the head saves is the
-- distribution. So there is no status column, no approver id, and no second
-- version to compare the first against.
--
-- What survives from the retracted design is the touched/untouched distinction.
-- In the 2025 file «never filled in» and «given nothing» looked identical, and
-- both zeroed a whole кафедра — `filledAt` is what tells them apart. It is not a
-- status and grants nobody a veto.
CREATE TABLE "StakeDistribution" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "filledAt" TIMESTAMP(3),
    "filledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StakeDistribution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StakeDistribution_departmentId_year_key" ON "StakeDistribution"("departmentId", "year");
CREATE INDEX "StakeDistribution_year_idx" ON "StakeDistribution"("year");
ALTER TABLE "StakeDistribution" ADD CONSTRAINT "StakeDistribution_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StakeDistribution" ADD CONSTRAINT "StakeDistribution_filledById_fkey"
    FOREIGN KEY ("filledById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One person's row — додаток 2 prints «Обсяг ставки за формулою» beside
-- «Розподілений обсяг ставки» with «Обґрунтування» between them, so BOTH numbers
-- are stored. The document is the comparison; keeping only the head's number
-- would make it unproducible.
--
-- Both are INTEGER HUNDREDTHS. The old system used floats here and produced
-- negative «нерозподілено».
CREATE TABLE "StakeAllocation" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "formulaHundredths" INTEGER NOT NULL,
    "proposedHundredths" INTEGER NOT NULL,
    "justification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StakeAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StakeAllocation_distributionId_staffId_key" ON "StakeAllocation"("distributionId", "staffId");
ALTER TABLE "StakeAllocation" ADD CONSTRAINT "StakeAllocation_distributionId_fkey"
    FOREIGN KEY ("distributionId") REFERENCES "StakeDistribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StakeAllocation" ADD CONSTRAINT "StakeAllocation_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

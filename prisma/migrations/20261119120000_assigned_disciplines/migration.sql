-- Disciplines the departments assigned to an НПП for a rating year, which the
-- person must answer in rating 5.1 one by one (owner, 2026-11-19).

-- CreateTable
CREATE TABLE "AssignedDiscipline" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalised" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignedDiscipline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignedDiscipline_year_idx" ON "AssignedDiscipline"("year");

-- CreateIndex
CREATE UNIQUE INDEX "AssignedDiscipline_staffId_year_nameNormalised_key" ON "AssignedDiscipline"("staffId", "year", "nameNormalised");

-- AddForeignKey
ALTER TABLE "AssignedDiscipline" ADD CONSTRAINT "AssignedDiscipline_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The official аспіранти list and their керівники (owner, 2026-10-07): п.12 of
-- the science plan picks from it instead of a typed ПІБ.
-- CreateTable
CREATE TABLE "Aspirant" (
    "id" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT NOT NULL DEFAULT '',
    "nameNormalised" TEXT NOT NULL,
    "speciality" TEXT NOT NULL,
    "departmentText" TEXT NOT NULL DEFAULT '',
    "admissionYear" INTEGER,
    "studyForm" TEXT NOT NULL DEFAULT '',
    "supervisorsRaw" TEXT NOT NULL DEFAULT '',
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aspirant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AspirantSupervisor" (
    "aspirantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,

    CONSTRAINT "AspirantSupervisor_pkey" PRIMARY KEY ("aspirantId","staffId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Aspirant_nameNormalised_speciality_key" ON "Aspirant"("nameNormalised", "speciality");

-- CreateIndex
CREATE INDEX "AspirantSupervisor_staffId_idx" ON "AspirantSupervisor"("staffId");

-- AddForeignKey
ALTER TABLE "AspirantSupervisor" ADD CONSTRAINT "AspirantSupervisor_aspirantId_fkey" FOREIGN KEY ("aspirantId") REFERENCES "Aspirant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AspirantSupervisor" ADD CONSTRAINT "AspirantSupervisor_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;


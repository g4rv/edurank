-- CreateTable
CREATE TABLE "AdmittedStudent" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalised" TEXT NOT NULL,
    "specialityId" TEXT NOT NULL,
    "degree" "StudentDegree" NOT NULL,
    "form" "StudyForm" NOT NULL,
    "funding" "StudentFunding" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmittedStudent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdmittedStudent_year_specialityId_form_funding_idx" ON "AdmittedStudent"("year", "specialityId", "form", "funding");

-- CreateIndex
CREATE UNIQUE INDEX "AdmittedStudent_year_nameNormalised_specialityId_form_fundi_key" ON "AdmittedStudent"("year", "nameNormalised", "specialityId", "form", "funding");

-- AddForeignKey
ALTER TABLE "AdmittedStudent" ADD CONSTRAINT "AdmittedStudent_specialityId_fkey" FOREIGN KEY ("specialityId") REFERENCES "Speciality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

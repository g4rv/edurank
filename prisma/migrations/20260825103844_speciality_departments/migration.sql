-- CreateTable
CREATE TABLE "SpecialityDepartment" (
    "specialityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecialityDepartment_pkey" PRIMARY KEY ("specialityId","departmentId")
);

-- CreateIndex
CREATE INDEX "SpecialityDepartment_departmentId_idx" ON "SpecialityDepartment"("departmentId");

-- AddForeignKey
ALTER TABLE "SpecialityDepartment" ADD CONSTRAINT "SpecialityDepartment_specialityId_fkey" FOREIGN KEY ("specialityId") REFERENCES "Speciality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialityDepartment" ADD CONSTRAINT "SpecialityDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

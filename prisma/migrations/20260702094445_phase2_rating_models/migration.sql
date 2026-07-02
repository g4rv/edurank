-- CreateEnum
CREATE TYPE "InputSource" AS ENUM ('NPP_SUBMISSION', 'DIVISION_MANAGED');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDING', 'APPROVED', 'REMOVED');

-- CreateEnum
CREATE TYPE "SubmittedByRole" AS ENUM ('NPP', 'DIVISION');

-- CreateEnum
CREATE TYPE "RatingYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "RatingTemplate" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "status" "RatingYearStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingSection" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "RatingSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityType" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL,
    "coefficientNote" TEXT,
    "inputSource" "InputSource" NOT NULL,
    "verifyingDivisionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ActivityType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "activityTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "evidence" JSONB NOT NULL,
    "computedValue" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDING',
    "submittedByRole" "SubmittedByRole" NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,
    "removedAt" TIMESTAMP(3),
    "removeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingEntry" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "section1Score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "section2Score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "section3Score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "section4Score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "section5Score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RatingTemplate_year_key" ON "RatingTemplate"("year");

-- CreateIndex
CREATE UNIQUE INDEX "RatingSection_templateId_number_key" ON "RatingSection"("templateId", "number");

-- CreateIndex
CREATE INDEX "ActivityType_verifyingDivisionId_idx" ON "ActivityType"("verifyingDivisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityType_templateId_code_key" ON "ActivityType"("templateId", "code");

-- CreateIndex
CREATE INDEX "Activity_staffId_year_idx" ON "Activity"("staffId", "year");

-- CreateIndex
CREATE INDEX "Activity_activityTypeId_status_idx" ON "Activity"("activityTypeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RatingEntry_staffId_year_key" ON "RatingEntry"("staffId", "year");

-- AddForeignKey
ALTER TABLE "RatingTemplate" ADD CONSTRAINT "RatingTemplate_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingSection" ADD CONSTRAINT "RatingSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RatingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityType" ADD CONSTRAINT "ActivityType_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RatingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityType" ADD CONSTRAINT "ActivityType_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "RatingSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityType" ADD CONSTRAINT "ActivityType_verifyingDivisionId_fkey" FOREIGN KEY ("verifyingDivisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingEntry" ADD CONSTRAINT "RatingEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

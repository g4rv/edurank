-- AlterTable
ALTER TABLE "DepartmentStake" ADD COLUMN     "bonusPoolHundredths" INTEGER;

-- CreateTable
CREATE TABLE "StakeStatusBonus" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "position" "AdminPosition" NOT NULL,
    "valueHundredths" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakeStatusBonus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StakeStatusBonus_year_idx" ON "StakeStatusBonus"("year");

-- CreateIndex
CREATE UNIQUE INDEX "StakeStatusBonus_year_position_key" ON "StakeStatusBonus"("year", "position");

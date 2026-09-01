-- CreateEnum
CREATE TYPE "KharakterystykaEntrySource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateTable
CREATE TABLE "KharakterystykaEntry" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "group" TEXT,
    "year" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "itemNumber" TEXT,
    "source" "KharakterystykaEntrySource" NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KharakterystykaEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KharakterystykaEntry_staffId_year_idx" ON "KharakterystykaEntry"("staffId", "year");

-- CreateIndex
CREATE INDEX "KharakterystykaEntry_position_idx" ON "KharakterystykaEntry"("position");

-- AddForeignKey
ALTER TABLE "KharakterystykaEntry" ADD CONSTRAINT "KharakterystykaEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

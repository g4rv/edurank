-- CreateTable
CREATE TABLE "ScienceCoauthorShare" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "hoursHundredths" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScienceCoauthorShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScienceCoauthorShare_staffId_idx" ON "ScienceCoauthorShare"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "ScienceCoauthorShare_workId_staffId_key" ON "ScienceCoauthorShare"("workId", "staffId");

-- AddForeignKey
ALTER TABLE "ScienceCoauthorShare" ADD CONSTRAINT "ScienceCoauthorShare_workId_fkey" FOREIGN KEY ("workId") REFERENCES "ScienceWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceCoauthorShare" ADD CONSTRAINT "ScienceCoauthorShare_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

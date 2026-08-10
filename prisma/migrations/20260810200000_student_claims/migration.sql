-- Term 2 of the ставка formula: students an НПП says they recruited.
--
-- The app's FIRST approval queue, and deliberately so. The rating has none — a
-- submission is APPROVED on save and oversight is post-moderation — because a
-- rating entry only affects its own author. A student claim is the opposite:
-- nothing counts until a human confirms it, because two НПП can claim the same
-- student and confirming one takes the bonus from the other.
CREATE TYPE "StudentDegree" AS ENUM ('BACHELOR', 'MASTER');
CREATE TYPE "StudyForm" AS ENUM ('FULL_TIME', 'PART_TIME');
CREATE TYPE "StudentFunding" AS ENUM ('STATE', 'CONTRACT');
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- Adding is SILENT on purpose. An НПП is never told that somebody else has
-- already claimed the same student, and nothing is refused at save. The
-- duplicate is the evidence, and it is shown only to the person who can judge
-- it — blocking the second claim would hand the ставка to whoever typed first
-- rather than to whoever did the work, and would leave the head with one row
-- and no conflict to see.
CREATE TABLE "StudentClaim" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "studentName" TEXT NOT NULL,
    -- Trimmed, lower-cased, spaces collapsed. Stored rather than computed at
    -- query time so the duplicate lookup can use an index — people mistype even
    -- when copying from the наказ, and this is what catches «Петренко  О.І.»
    -- against «петренко О. І.».
    "studentNameNormalised" TEXT NOT NULL,
    "specialityId" TEXT NOT NULL,
    "degree" "StudentDegree" NOT NULL,
    "form" "StudyForm" NOT NULL,
    "funding" "StudentFunding" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    -- «Who was first» — evidence for the head to weigh, never an automatic winner
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentClaim_pkey" PRIMARY KEY ("id")
);

-- The same НПП adding the same student twice is their own slip, and is blocked.
-- Two DIFFERENT people claiming one student is the case this whole feature
-- exists for and must stay possible — note `staffId` leads the key.
CREATE UNIQUE INDEX "StudentClaim_staffId_year_studentNameNormalised_specialityId_key"
    ON "StudentClaim"("staffId", "year", "studentNameNormalised", "specialityId");

-- The head's duplicate view scans a year by normalised name
CREATE INDEX "StudentClaim_year_studentNameNormalised_idx"
    ON "StudentClaim"("year", "studentNameNormalised");
CREATE INDEX "StudentClaim_staffId_year_idx" ON "StudentClaim"("staffId", "year");

ALTER TABLE "StudentClaim" ADD CONSTRAINT "StudentClaim_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentClaim" ADD CONSTRAINT "StudentClaim_specialityId_fkey"
    FOREIGN KEY ("specialityId") REFERENCES "Speciality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentClaim" ADD CONSTRAINT "StudentClaim_confirmedById_fkey"
    FOREIGN KEY ("confirmedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

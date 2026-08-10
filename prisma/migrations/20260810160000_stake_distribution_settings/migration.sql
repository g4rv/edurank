-- Розподіл ставок — the settings half: what the вчена рада approves for a year
-- and what ADMIN enters per кафедра. The distribution itself (claims,
-- allocations) comes later; nothing here depends on it.
--
-- Full specification: docs/stake-distribution.md.
--
-- EVERY ставка value below is an INTEGER of HUNDREDTHS, never a float. The old
-- Google-Sheets system stored floats and produced negative «нерозподілено» — a
-- кафедра that had overspent its pool according to a subtraction and had not
-- according to the people in it. 0.1 + 0.2 ≠ 0.3 in binary floating point, and a
-- distribution is a long chain of additions and one subtraction.

-- Specialities students are recruited into. `name` is what a claim is matched
-- against and is therefore unique; `code` («012», «015.05») is documentation and
-- may be absent — додаток 5 lists names only.
CREATE TABLE "Speciality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Speciality_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Speciality_name_key" ON "Speciality"("name");

-- Норматив чисельності здобувачів на 1 ставку — додаток 5.
--
-- ONE number per speciality, not the four columns the sheet prints. Verified
-- across all 38 rows: every column follows the law's own multipliers off a
-- single base (магістр ×0.5, заочна ×4), so four stored numbers would be four
-- chances to disagree with each other.
--
-- Per YEAR because the вчена рада re-approves the table annually and the app
-- must follow whatever it approves — this is data, not a constant in code.
CREATE TABLE "SpecialityNorm" (
    "id" TEXT NOT NULL,
    "specialityId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "base" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpecialityNorm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SpecialityNorm_specialityId_year_key" ON "SpecialityNorm"("specialityId", "year");
CREATE INDEX "SpecialityNorm_year_idx" ON "SpecialityNorm"("year");
ALTER TABLE "SpecialityNorm" ADD CONSTRAINT "SpecialityNorm_specialityId_fkey"
    FOREIGN KEY ("specialityId") REFERENCES "Speciality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The узгоджуючий коефіцієнт applied to контракт students, per year.
-- 0.175 for 2026, confirmed by the owner 2026-08-07 and measured independently
-- across 1389 recorded students. A setting, not a constant.
CREATE TABLE "StakeYearSettings" (
    "year" INTEGER NOT NULL,
    "contractCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 0.175,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StakeYearSettings_pkey" PRIMARY KEY ("year")
);

-- `Кст` — the pool of ставки a кафедра has to spread. Set centrally by
-- ADMIN/проректор, never by the head: the head divides what they are given.
--
-- `Кнпп` is deliberately NOT a column here, although the design sketch had one.
-- It is derived from the Характеристика and would go stale the moment somebody
-- submits an achievement. Freezing it belongs with the distribution grid, where
-- there will be a distribution to freeze it against.
CREATE TABLE "DepartmentStake" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kstHundredths" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DepartmentStake_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DepartmentStake_departmentId_year_key" ON "DepartmentStake"("departmentId", "year");
CREATE INDEX "DepartmentStake_year_idx" ON "DepartmentStake"("year");
ALTER TABLE "DepartmentStake" ADD CONSTRAINT "DepartmentStake_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-person floor and ceiling, applied after the formula:
-- `final = clamp(Vc, min, max)`.
--
-- The формула alone cannot reproduce what the university actually does: of the
-- 175 people in the 2025 distribution, 39 % sit exactly on a per-person cap and
-- none exceeds one. The caps are real and they stay.
--
-- ADMIN only, deliberately. A завідувач distributes inside limits they cannot
-- change, which is what stops a head capping colleagues down and themselves up.
CREATE TABLE "StaffStakeLimits" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "minHundredths" INTEGER NOT NULL,
    "maxHundredths" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffStakeLimits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffStakeLimits_staffId_year_key" ON "StaffStakeLimits"("staffId", "year");
CREATE INDEX "StaffStakeLimits_year_idx" ON "StaffStakeLimits"("year");
ALTER TABLE "StaffStakeLimits" ADD CONSTRAINT "StaffStakeLimits_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

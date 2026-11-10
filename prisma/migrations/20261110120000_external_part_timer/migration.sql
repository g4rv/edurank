-- «Зовнішній сумісник» (owner, 2026-11-10): a person from another institution who
-- works part-time on one кафедра. Still an НПП (isNpp stays true) with a profile,
-- Характеристика and qualifications; no rating, students or science plan.
ALTER TABLE "Staff" ADD COLUMN "isExternalPartTimer" BOOLEAN NOT NULL DEFAULT false;

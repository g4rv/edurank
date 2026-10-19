-- An indicator that must be filled before the rest of the rating opens
-- (owner, 2026-10-16 — 5.1, «Я викладач»). Off for every existing row; the
-- one-off `pnpm db:lecturer-gate` switches it on for 5.1.
ALTER TABLE "ActivityType" ADD COLUMN "gatesRating" BOOLEAN NOT NULL DEFAULT false;

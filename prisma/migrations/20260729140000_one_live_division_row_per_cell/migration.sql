-- One live division-entered row per (staff, indicator, year).
--
-- upsertDivisionActivity looks for an existing row and then creates one, so two
-- editors saving the same cell at the same moment both find nothing and both
-- insert. The rating then counts the indicator twice, silently, in a number that
-- ends up in an official report.
--
-- The constraint is partial on purpose. НПП submissions are deliberately
-- repeatable — several conferences, several publications — so a plain unique
-- constraint on the triple would break them. Only DIVISION rows are one-per-cell,
-- and discarded rows are excluded so a REMOVED row never blocks a correction.
CREATE UNIQUE INDEX "Activity_one_live_division_row"
ON "Activity" ("staffId", "activityTypeId", "year")
WHERE "submittedByRole" = 'DIVISION' AND "status" <> 'REMOVED';

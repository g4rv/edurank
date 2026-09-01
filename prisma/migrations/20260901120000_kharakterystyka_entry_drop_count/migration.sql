-- One typed row now stands for exactly one item: a position asking for five
-- wants five rows. `count` said otherwise and nothing ever set it above 1 —
-- the importer hardcodes 1, and only the hand-typed form could raise it.
ALTER TABLE "KharakterystykaEntry" DROP COLUMN "count";

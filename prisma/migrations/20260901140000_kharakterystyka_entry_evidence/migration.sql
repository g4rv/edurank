-- A typed row now answers the position's own fields instead of one blank box,
-- and `text` is generated from those answers. Keeping them makes the row
-- re-readable; every existing row keeps its text and gets no evidence.
ALTER TABLE "KharakterystykaEntry" ADD COLUMN "evidence" JSONB;

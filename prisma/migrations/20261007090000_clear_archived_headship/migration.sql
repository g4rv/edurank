-- Archiving now takes a завідувач's or декан's post away (owner, 2026-10-07).
-- Somebody archived before that kept it: on production one кафедра pointed at
-- an archived head, and its edit page showed the person's id in place of a
-- name. Brought in line once; the кафедра reads «—» until ADMIN names a head.
UPDATE "Department" SET "headId" = NULL
WHERE "headId" IN (SELECT "id" FROM "Staff" WHERE "archivedAt" IS NOT NULL);

UPDATE "Faculty" SET "deanId" = NULL
WHERE "deanId" IN (SELECT "id" FROM "Staff" WHERE "archivedAt" IS NOT NULL);

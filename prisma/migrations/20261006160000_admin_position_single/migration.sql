-- One administrative post, picked by hand (owner, 2026-10-06): «Адміністративні
-- посади» as badges is gone, and `adminPosition` is edited directly again
-- instead of being a mirror of `adminPositions`. A завідувач and a декан get
-- their post from the кафедра / факультет that names them, not from a pick.
--
-- The badge column stays, unread, until the release that drops the legacy
-- columns. Its grants go now: the field is no longer offered anywhere, and
-- the 20261006144152 migration copied them FROM `adminPosition`, whose own
-- grants were left in place — so no division loses anything.
DELETE FROM "DivisionFieldPermission" WHERE "fieldName" = 'adminPositions';

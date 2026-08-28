-- Indexes only. No column is added, dropped or retyped and no row is touched,
-- so this applies in either deploy order and `DROP INDEX` undoes it entirely.
--
-- All three are NON-UNIQUE, which is what makes them safe on live data: there
-- is no state of the tables that can defeat the statement, so this cannot be
-- the migration that stops a deploy (compare the SET NOT NULL in
-- 20260824120000_stake_limits_per_department, which deliberately could).
--
-- The lock is SHARE — reads keep working, writes to these two tables wait for
-- the duration. Both are small, so it is milliseconds. Not CONCURRENTLY:
-- Prisma runs each migration in a transaction and CONCURRENTLY cannot run
-- inside one, and at this size there is nothing to gain.

-- «Who is on this кафедра» reads StaffDepartment by departmentId, but the
-- primary key is ([staffId, departmentId]) and Postgres can only use that
-- prefix-first. See onDepartment / onDepartments / onFaculty in
-- lib/queries/roster.ts, spread into eight queries.
CREATE INDEX "StaffDepartment_departmentId_idx" ON "StaffDepartment"("departmentId");

-- AuditLog had no index at all, and it is the one table that grows without
-- bound: every mutation in the app writes a row. /admin/audit-log is its only
-- reader, always ordering by createdAt, optionally narrowed by entity.
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt");

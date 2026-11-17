-- Rollback for 20261116120000_department_indicator_derivation.
-- Loses only the mappings the script wrote; no report value is stored there.
ALTER TABLE "DepartmentIndicator" DROP COLUMN "derivation";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261116120000_department_indicator_derivation';

import {
  ACTIVITY_TYPES_2026,
  RATING_DIVISIONS,
  SECTION_TITLES,
} from '../lib/rating/activity-types';
import { dbSpecs } from '../lib/rating/db-specs';
import { SPECIALITY_NORMS_2026, DEFAULT_CONTRACT_COEFFICIENT } from '../lib/stake/norms';
import type { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';

// Everything a REAL university needs before anybody can use the app, and
// nothing a real university would be embarrassed to find in its database.
//
// Split out of `seed.ts` on 2026-08-13, when production became a thing. That
// file writes this plus a demo university — invented faculty, invented кафедра,
// five accounts with published passwords, two people with fabricated ratings.
// Production needs the first half and must never receive the second.
//
// It is one module rather than two copies on purpose: the catalogue is 67
// indicators, 38 specialities and six divisions, and a second copy would drift
// silently. When it drifts, production scores people against indicators the
// вчена рада did not approve — which is the kind of bug nobody notices until an
// argument about somebody's ставка.
//
// Every write is an upsert keyed on something stable, so running it twice
// changes nothing and running it after an admin has edited a value leaves the
// edit alone.

export interface CatalogueResult {
  templateId: string;
  year: number;
  divisionIds: Record<string, string>;
  activityTypeCount: number;
  specialityCount: number;
}

export async function seedCatalogue(prisma: PrismaClient, year = 2026): Promise<CatalogueResult> {
  const divisionIds = await seedDivisions(prisma);
  await seedNnvPermissions(prisma, divisionIds.NNV);
  const { templateId, activityTypeCount } = await seedTemplate(prisma, year, divisionIds);
  const specialityCount = await seedSpecialities(prisma, year);

  return { templateId, year, divisionIds, activityTypeCount, specialityCount };
}

/**
 * The six rating divisions.
 *
 * Upserted on the catalogue's stable `registryKey` rather than the name: the
 * name is what an admin may rename on /divisions, and re-seeding after a rename
 * must find the same row instead of creating a second one beside it.
 *
 * ННВ is the division that moderates the rating. Its flag is set on update too,
 * so a database seeded before the column existed does not keep a ННВ that
 * cannot moderate anything.
 */
async function seedDivisions(prisma: PrismaClient): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const [key, name] of Object.entries(RATING_DIVISIONS)) {
    const canModerateRating = key === 'NNV';
    const division = await prisma.division.upsert({
      where: { registryKey: key },
      update: { canModerateRating },
      create: { name, registryKey: key, canModerateRating },
    });
    ids[key] = division.id;
  }
  return ids;
}

/**
 * What ННВ editors may edit, and which entities they may manage.
 *
 * `employmentRate` and `divisionId` are deliberately absent: the first is
 * confidential and the second decides an editor's own scope, so both are
 * ADMIN-only and `setFieldPermission` refuses to grant them. Seeding a row for
 * either would create an inert grant that reads as working.
 */
async function seedNnvPermissions(prisma: PrismaClient, nnvId: string): Promise<void> {
  const fields = [
    'academicRank',
    'scientificDegree',
    'degreeMatchesDepartment',
    'pedagogicalExperience',
    'wosUrl',
    'wosCitationCount',
    'scopusUrl',
    'scopusCitationCount',
    'googleScholarUrl',
    'googleScholarCitationCount',
    'orcidId',
  ];
  for (const fieldName of fields) {
    await prisma.divisionFieldPermission.upsert({
      where: { divisionId_fieldName: { divisionId: nnvId, fieldName } },
      update: {},
      create: { divisionId: nnvId, fieldName },
    });
  }

  const entities = ['STAFF', 'DEPARTMENT', 'FACULTY'] as const;
  const actions = ['CREATE', 'UPDATE', 'DELETE'] as const;
  for (const entity of entities) {
    for (const action of actions) {
      await prisma.divisionEntityPermission.upsert({
        where: { divisionId_entity_action: { divisionId: nnvId, entity, action } },
        update: {},
        create: { divisionId: nnvId, entity, action },
      });
    }
  }
}

/**
 * The year's template, its five sections, and all 67 indicators.
 *
 * **`isActive` is set on CREATE only** (2026-08-17). It used to be forced true
 * on every run, and `deployment.md` says — correctly — that `pnpm db:seed` is
 * safe to re-run after any upgrade. Those two together are a trap the moment a
 * second year exists: activate 2027, re-seed, and 2026 is active again beside
 * it. Nothing in the schema forbids two, and `getActiveTemplate` does
 * `findFirst` with no ordering, so which one wins is whatever Postgres returns
 * first — the whole app silently scoring against the wrong year.
 *
 * Activation belongs to `activateYear` in /admin/rating, which already clears
 * the flag from every other template inside one transaction. A seed must not
 * have an opinion about which year is open.
 */
async function seedTemplate(
  prisma: PrismaClient,
  year: number,
  divisionIds: Record<string, string>
): Promise<{ templateId: string; activityTypeCount: number }> {
  const template = await prisma.ratingTemplate.upsert({
    where: { year },
    update: {},
    create: { year, name: `Рейтинг НПП ${year}`, isActive: true },
  });

  const sectionIds: Record<number, string> = {};
  for (const [number, title] of Object.entries(SECTION_TITLES)) {
    const section = await prisma.ratingSection.upsert({
      where: { templateId_number: { templateId: template.id, number: Number(number) } },
      update: { title },
      create: { templateId: template.id, number: Number(number), title },
    });
    sectionIds[Number(number)] = section.id;
  }

  for (const def of ACTIVITY_TYPES_2026) {
    const specs = dbSpecs(def);
    const data = {
      sectionId: sectionIds[def.section],
      order: def.order,
      label: def.label,
      itemNumber: specs.itemNumber,
      maxPerYear: specs.maxPerYear,
      requiresVerification: specs.requiresVerification,
      entityFirstEntry: specs.entityFirstEntry,
      evidenceFields: specs.evidenceFields as unknown as Prisma.InputJsonValue,
      scoring: specs.scoring as unknown as Prisma.InputJsonValue,
      licencePositions: specs.licencePositions as unknown as Prisma.InputJsonValue,
      coefficient: def.coefficient,
      coefficientNote: def.coefficientNote ?? null,
      inputSource: def.inputSource,
      verifyingDivisionId: def.verifyingDivision ? divisionIds[def.verifyingDivision] : null,
      isActive: true,
    };
    await prisma.activityType.upsert({
      where: { templateId_code: { templateId: template.id, code: def.code } },
      update: data,
      create: { templateId: template.id, code: def.code, ...data },
    });
  }

  const activityTypeCount = await prisma.activityType.count({ where: { templateId: template.id } });
  return { templateId: template.id, activityTypeCount };
}

/**
 * Додаток 5 — the 38 specialities and their норматив, plus the year's
 * узгоджуючий коефіцієнт.
 *
 * Seed data, not constants: the вчена рада re-approves both every year and an
 * admin edits them in the app. `update: {}` on every upsert is what makes that
 * safe — an edited `base` survives a re-seed, and only a missing row is created.
 */
async function seedSpecialities(prisma: PrismaClient, year: number): Promise<number> {
  for (const [name, base] of SPECIALITY_NORMS_2026) {
    const speciality = await prisma.speciality.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    await prisma.specialityNorm.upsert({
      where: { specialityId_year: { specialityId: speciality.id, year } },
      update: {},
      create: { specialityId: speciality.id, year, base },
    });
  }

  await prisma.stakeYearSettings.upsert({
    where: { year },
    update: {},
    create: { year, contractCoefficient: DEFAULT_CONTRACT_COEFFICIENT },
  });

  return prisma.speciality.count();
}

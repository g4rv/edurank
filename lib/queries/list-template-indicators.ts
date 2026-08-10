import { db } from '@/lib/db';

/**
 * Every active indicator of one year's template — including the ones an НПП
 * cannot fill in themselves (division-managed and profile-derived), because
 * those still carry points and still belong in the complete picture.
 *
 * Used to show the rating table in full: an indicator with no activity gets a
 * row scoring 0 rather than being absent, so a person can see what is left to
 * do instead of inferring it from what is missing.
 */
export async function listTemplateIndicators(year: number) {
  return db.activityType.findMany({
    where: { isActive: true, template: { year } },
    select: {
      id: true,
      itemNumber: true,
      label: true,
      inputSource: true,
      // So the table can say WHICH відділ fills a row, not just «відділ»
      verifyingDivision: { select: { name: true, registryKey: true } },
      section: { select: { number: true, title: true } },
    },
    orderBy: [{ section: { number: 'asc' } }, { order: 'asc' }],
  });
}

export type TemplateIndicator = Awaited<ReturnType<typeof listTemplateIndicators>>[number];

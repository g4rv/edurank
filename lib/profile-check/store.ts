import type { Prisma, PrismaClient } from '@/lib/generated/prisma/client';
import type { PersonResult } from '@/lib/profile-check/types';

/**
 * Keeps a person's latest result: one row per platform, replaced on every run.
 * All four platforms are written (`no_link` and `not_implemented` too), so the
 * page reads one uniform row set and never has to guess what a missing row means.
 */
export async function saveResult(
  client: Pick<PrismaClient, '$transaction' | 'profileCheck'>,
  result: PersonResult
): Promise<void> {
  await client.$transaction(
    result.platforms.map((p) => {
      const data = {
        link: p.link,
        status: p.status,
        error: p.error ?? null,
        checks: p.checks as unknown as Prisma.InputJsonValue,
        checkedAt: new Date(p.checkedAt),
      };
      return client.profileCheck.upsert({
        where: { staffId_platform: { staffId: result.staffId, platform: p.platform } },
        create: { staffId: result.staffId, platform: p.platform, ...data },
        update: data,
      });
    })
  );
}

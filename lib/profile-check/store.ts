import type { Prisma, PrismaClient } from '@/lib/generated/prisma/client';
import type { PersonResult, Platform } from '@/lib/profile-check/types';

/**
 * Keeps a person's latest result: one row per platform, replaced on every run.
 * Every platform the result holds is written (`no_link` and `not_implemented`
 * too), so the page reads one uniform row set and never has to guess what a
 * missing row means. A run of one platform holds only that platform, so it never
 * touches the others' rows.
 *
 * **A failed attempt never replaces a real result** (owner, 2026-11-05). `failed`
 * means we could not ask — Google blocked us, there was no browser, the network
 * dropped — and says nothing about the profile. Writing it over last week's
 * answer wiped 294 Google Scholar results the moment Google began refusing, and
 * the page then showed «Не вдалося» for everybody. So when the new result is
 * `failed` and the stored one is a real answer (anything but `failed`), the
 * stored one stays. A genuine `error` («profile not found») is an answer and
 * does replace, because the profile really changed. With nothing stored, or
 * only an earlier failure, the failure IS written so the page can show it.
 *
 * Returns the platforms whose stored result was kept, so the caller can say so.
 */
export async function saveResult(
  client: Pick<PrismaClient, '$transaction' | 'profileCheck'>,
  result: PersonResult
): Promise<{ kept: Platform[] }> {
  const failedNow = result.platforms.filter((p) => p.status === 'failed').map((p) => p.platform);

  let keep = new Set<string>();
  if (failedNow.length > 0) {
    const real = await client.profileCheck.findMany({
      where: {
        staffId: result.staffId,
        platform: { in: failedNow },
        NOT: { status: 'failed' },
      },
      select: { platform: true },
    });
    keep = new Set(real.map((r) => r.platform));
  }

  await client.$transaction(
    result.platforms
      .filter((p) => !keep.has(p.platform))
      .map((p) => {
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

  return { kept: [...keep] as Platform[] };
}

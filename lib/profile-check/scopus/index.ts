import type { Check, PlatformChecker } from '@/lib/profile-check/types';

/** The author id in a Scopus link: `authorId=57219915893`, any case. */
export function scopusAuthorId(link: string): string | null {
  return /[?&]authorid=(\d{6,})/i.exec(link)?.[1] ?? null;
}

/**
 * Scopus, as far as it can be checked WITHOUT an API key: the link carries an
 * author id. The profile itself is not read — scopus.com sends everything but
 * a signed-in browser to a login page, and Elsevier's API gives nothing but the
 * id without a key — so the result says plainly that its content is not
 * checked, instead of passing a profile nobody looked at.
 *
 * The id IS compared with the Scopus Author ID on the person's ORCID page, by
 * the ORCID check. When an Elsevier key exists this is where the profile's
 * name, ORCID, affiliation and h-index are read.
 */
export const scopusChecker: PlatformChecker = {
  platform: 'scopus',
  implemented: true,
  async check(link) {
    const id = scopusAuthorId(link);
    if (!id) {
      return {
        platform: 'scopus',
        link,
        status: 'error',
        checks: [
          {
            field: 'profile',
            current: link,
            shouldBe: 'Посилання на профіль: scopus.com/authid/detail.uri?authorId=…',
            status: 'error',
            message: 'У посиланні немає ідентифікатора автора (authorId=…)',
          },
        ],
      };
    }
    const canonical = `https://www.scopus.com/authid/detail.uri?authorId=${id}`;
    const checks: Check[] = [
      {
        field: 'profile',
        current: id,
        shouldBe: 'Ідентифікатор автора Scopus',
        status: 'ok',
        message: null,
      },
      {
        field: 'scopus_content',
        current: null,
        shouldBe: 'ORCID, ім’я, афіліація та h-індекс профілю',
        status: 'info',
        message: 'Вміст профілю Scopus не перевіряється: для цього потрібен ключ Elsevier API',
      },
    ];
    return { platform: 'scopus', link: canonical, status: 'ok', checks };
  },
};

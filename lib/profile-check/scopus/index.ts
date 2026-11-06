import { logWarning } from '@/lib/log';
import { normaliseOrcid } from '@/lib/orcid';
import { createGate, type Gate } from '@/lib/profile-check/gate';
import {
  worstStatus,
  type Check,
  type PlatformChecker,
  type PlatformResult,
} from '@/lib/profile-check/types';
import { fetchScopusAuthor, type ScopusFetch } from './api';
import {
  checkScopusAffiliation,
  checkScopusHIndex,
  checkScopusName,
  checkScopusOrcid,
} from './checks';
import { parseScopusAuthor } from './parse';

/** The author id in a Scopus link: `authorId=57219915893`, any case. */
export function scopusAuthorId(link: string): string | null {
  return /[?&]authorid=(\d{6,})/i.exec(link)?.[1] ?? null;
}

type Result = Omit<PlatformResult, 'checkedAt'>;

const profileUrl = (id: string) => `https://www.scopus.com/authid/detail.uri?authorId=${id}`;

function failed(link: string, error: string): Result {
  return { platform: 'scopus', link, status: 'failed', error, checks: [] };
}

/**
 * Elsevier allows 3 requests a second and 5,000 a week, so a gap of about half a
 * second is respectful; a refusal (429) closes the door for ten minutes like the
 * other sites'. The whole staff is ~135 requests.
 */
const scopusGate: Gate = createGate({ gapMs: 500, jitterMs: 150 });

/** When a refusal was last logged — module-wide, so a whole run says it once a minute */
let lastRefusalLog = 0;

/**
 * Scopus, read through Elsevier's Author Retrieval API when `SCOPUS_API_KEY` is
 * set (owner, 2026-11-05): the profile's ORCID is the person's own, the name is
 * Latin, the current affiliation is the university, the profile carries its
 * subject areas, and the h-index is shown.
 *
 * With no key it can only read the author id from the link and says plainly
 * that the profile itself was not read — scopus.com sends everything but a
 * signed-in browser to a login page, and the API gives nothing but the id
 * without a key.
 */
export function createScopusChecker({
  gate = scopusGate,
  getKey = () => process.env.SCOPUS_API_KEY?.trim() || null,
  fetchAuthor = fetchScopusAuthor,
}: {
  gate?: Gate;
  getKey?: () => string | null;
  fetchAuthor?: (id: string, key: string, f: typeof fetch) => Promise<ScopusFetch>;
} = {}): PlatformChecker {
  return {
    platform: 'scopus',
    implemented: true,
    async check(link, { person, fetchImpl }) {
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
      const canonical = profileUrl(id);

      const key = getKey();
      if (!key) {
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
            message: 'не перевіряється — не задано ключ Elsevier API (SCOPUS_API_KEY)',
          },
        ];
        return { platform: 'scopus', link: canonical, status: 'ok', checks };
      }

      const wait = gate.blockedFor();
      if (wait > 0) {
        return failed(
          canonical,
          `Elsevier тимчасово обмежив запити — спробуйте приблизно за ${Math.max(1, Math.ceil(wait / 60_000))} хв`
        );
      }

      await gate.wait();
      const got = await fetchAuthor(id, key, fetchImpl);

      if (got.kind === 'limited') {
        gate.block();
        return failed(canonical, 'Elsevier обмежив запити (ліміт ключа) — спробуйте пізніше');
      }
      if (got.kind === 'unauthorized') {
        // Said once a minute: a run asks ~300 times and the reason is always the same
        if (Date.now() - lastRefusalLog > 60_000) {
          lastRefusalLog = Date.now();
          logWarning(
            'profileCheck.scopus',
            `Elsevier refused the key — HTTP ${got.status}, ${got.reason ?? 'no reason given'}`
          );
        }
        return failed(
          canonical,
          'Elsevier не дає ключу доступу до профілів з цього сервера — потрібен інституційний токен (SCOPUS_INSTTOKEN)'
        );
      }
      if (got.kind === 'error') return failed(canonical, got.message);
      if (got.kind === 'not_found') {
        return {
          platform: 'scopus',
          link: canonical,
          status: 'error',
          checks: [
            {
              field: 'profile',
              current: link,
              shouldBe: 'Профіль Scopus, що існує',
              status: 'error',
              message: 'Профіль не знайдено — перевірте посилання',
            },
          ],
        };
      }

      const profile = parseScopusAuthor(got.item);
      if (!profile) return failed(canonical, 'Відповідь Elsevier має незнайому будову');
      if (profile.minimized) {
        return failed(
          canonical,
          'Ключ Elsevier не дає доступу до даних профілю (потрібна підписка установи)'
        );
      }

      const checks = [
        checkScopusOrcid(profile, normaliseOrcid(person.links.orcid)),
        checkScopusName(profile),
        checkScopusAffiliation(profile),
        checkScopusHIndex(profile),
      ];
      return { platform: 'scopus', link: canonical, status: worstStatus(checks), checks };
    },
  };
}

export const scopusChecker = createScopusChecker();

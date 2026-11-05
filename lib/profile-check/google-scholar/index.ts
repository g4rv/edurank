import { normaliseOrcid } from '@/lib/orcid';
import { worstStatus, type Check, type PlatformChecker } from '@/lib/profile-check/types';
import { checkScholarDescription, checkScholarName, checkScholarWorks } from './checks';
import { fetchScholarProfile } from './fetch';
import { scholarGate, type Gate } from './gate';
import { parseScholarProfile, scholarUserId } from './parse';

function check(
  field: string,
  current: unknown,
  shouldBe: string,
  status: Check['status'],
  message: string | null = null
): Check {
  return { field, current, shouldBe, status, message };
}

/**
 * Google Scholar, judged against the reference profile (owner, 2026-11-05): the
 * name carries the person's ORCID, the latest article is from this year or the
 * last, and the description names the university with its ROR link. The h-index,
 * citations and i10-index are recorded as `ok` checks so the page can show
 * them; they have no threshold — the university has not given one.
 */
export function createScholarChecker(
  gate: Gate = scholarGate,
  now: () => Date = () => new Date()
): PlatformChecker {
  return {
    platform: 'googleScholar',
    implemented: true,
    async check(link, { person, fetchImpl }) {
      const id = scholarUserId(link);
      if (!id) {
        return {
          platform: 'googleScholar',
          link,
          status: 'error',
          checks: [
            check(
              'profile',
              link,
              'Посилання на профіль: scholar.google.com/citations?user=…',
              'error',
              'У посиланні немає ідентифікатора профілю (user=…)'
            ),
          ],
        };
      }
      const canonical = `https://scholar.google.com/citations?user=${id}`;

      const wait = gate.blockedFor();
      if (wait > 0) return blocked(canonical, Math.ceil(wait / 60_000));

      await gate.wait();
      const got = await fetchScholarProfile(id, fetchImpl);

      if (got.kind === 'blocked') {
        gate.block();
        return blocked(canonical, Math.ceil(gate.blockedFor() / 60_000));
      }
      if (got.kind === 'error') {
        return {
          platform: 'googleScholar',
          link: canonical,
          status: 'failed',
          error: got.message,
          checks: [],
        };
      }
      if (got.kind === 'not_found') {
        return {
          platform: 'googleScholar',
          link: canonical,
          status: 'error',
          checks: [
            check(
              'profile',
              link,
              'Відкритий профіль Google Scholar',
              'error',
              'Профіль не знайдено або він закритий — перевірте посилання'
            ),
          ],
        };
      }

      const profile = parseScholarProfile(got.html);
      if (!profile) {
        return {
          platform: 'googleScholar',
          link: canonical,
          status: 'failed',
          error: 'Сторінка профілю має незнайому будову',
          checks: [],
        };
      }
      // The reference profile's three requirements, then its numbers
      const checks: Check[] = [
        checkScholarName(profile, normaliseOrcid(person.links.orcid)),
        checkScholarWorks(profile, now()),
        checkScholarDescription(profile),
      ];
      if (profile.stats) {
        const { hIndex, citations, i10Index } = profile.stats;
        checks.push(
          check('h_index', hIndex, 'Інформація', 'ok'),
          check('citations', citations, 'Інформація', 'ok'),
          check('i10_index', i10Index, 'Інформація', 'ok')
        );
      } else {
        checks.push(
          check(
            'h_index',
            null,
            'Показники профілю',
            'warning',
            'Статистику цитувань не знайдено на сторінці профілю'
          )
        );
      }
      return {
        platform: 'googleScholar',
        link: canonical,
        status: worstStatus(checks),
        checks,
      };
    },
  };
}

function blocked(link: string, minutes: number) {
  return {
    platform: 'googleScholar' as const,
    link,
    status: 'failed' as const,
    error: `Google Scholar тимчасово обмежив запити — спробуйте приблизно за ${Math.max(1, minutes)} хв`,
    checks: [] as Check[],
  };
}

export const scholarChecker = createScholarChecker();

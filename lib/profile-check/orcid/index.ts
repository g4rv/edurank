import { normaliseOrcid } from '@/lib/orcid';
import { worstStatus, type PlatformChecker } from '@/lib/profile-check/types';
import { runOrcidChecks } from './checks';
import { extractOrcid } from './extract';
import { fetchOrcidRecord } from './fetch';

/** ORCID: public API → extract → the university's requirements. */
export const orcidChecker: PlatformChecker = {
  platform: 'orcid',
  implemented: true,
  async check(link, { person, fetchImpl }) {
    const id = normaliseOrcid(link);
    if (!id) {
      return {
        platform: 'orcid',
        link,
        status: 'failed',
        error: 'Це не ORCID iD',
        checks: [],
      };
    }
    try {
      const record = await fetchOrcidRecord(id, fetchImpl);
      const checks = runOrcidChecks(extractOrcid(record), {
        wos: Boolean(person.links.wos),
        scopus: Boolean(person.links.scopus),
        googleScholar: Boolean(person.links.googleScholar),
      });
      return {
        platform: 'orcid',
        link: `https://orcid.org/${id}`,
        status: worstStatus(checks),
        checks,
      };
    } catch (e) {
      return {
        platform: 'orcid',
        link: `https://orcid.org/${id}`,
        status: 'failed',
        error: e instanceof Error ? e.message : 'Не вдалося прочитати профіль',
        checks: [],
      };
    }
  },
};

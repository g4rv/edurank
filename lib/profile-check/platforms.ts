import { orcidChecker } from '@/lib/profile-check/orcid';
import type { Platform, PlatformChecker } from '@/lib/profile-check/types';

/**
 * A platform whose requirements have not been given yet. The runner reports it
 * as `not_implemented` and never calls it, so a link is not lost and not
 * judged. Replace the entry below with a real checker when the rules arrive.
 */
function placeholder(platform: Platform): PlatformChecker {
  return {
    platform,
    implemented: false,
    async check(link) {
      return { platform, link, status: 'not_implemented', checks: [] };
    },
  };
}

export const CHECKERS: Record<Platform, PlatformChecker> = {
  orcid: orcidChecker,
  wos: placeholder('wos'),
  scopus: placeholder('scopus'),
  googleScholar: placeholder('googleScholar'),
};

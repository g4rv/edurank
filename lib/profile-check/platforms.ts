import { scholarChecker } from '@/lib/profile-check/google-scholar';
import { orcidChecker } from '@/lib/profile-check/orcid';
import { scopusChecker } from '@/lib/profile-check/scopus';
import type { Platform, PlatformChecker } from '@/lib/profile-check/types';
import { wosChecker } from '@/lib/profile-check/web-of-science';

/**
 * One checker per platform. A platform whose rules are not given yet would be a
 * checker with `implemented: false`, which the runner reports as
 * `not_implemented` without calling it — none is left today.
 */
export const CHECKERS: Record<Platform, PlatformChecker> = {
  orcid: orcidChecker,
  wos: wosChecker,
  scopus: scopusChecker,
  googleScholar: scholarChecker,
};

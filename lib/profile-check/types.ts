/**
 * Profile check — shared shapes.
 *
 * A person has up to four research profiles. Each platform has its own
 * `PlatformChecker`: it fetches what the platform shows about the person and
 * judges it against the university's requirements. The runner treats all of
 * them alike, so a new platform is one more checker in `platforms.ts`.
 *
 * Ported from the standalone Python tool `npp-profile-scraper` (ORCID only).
 * The other three platforms are placeholders until their requirements arrive.
 */

export const PLATFORMS = ['orcid', 'wos', 'scopus', 'googleScholar'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** `info` is advice, never a failure; `warning` is doubtful; `error` is wrong. */
export type CheckStatus = 'ok' | 'info' | 'warning' | 'error';

export interface Check {
  field: string;
  /** What the profile holds now */
  current: unknown;
  /** What the university requires, in words */
  shouldBe: string;
  status: CheckStatus;
  message: string | null;
}

/**
 * - `no_link`         the person has not given this profile
 * - `not_implemented` the platform has no checker yet
 * - `failed`          the platform could not be read (network, 404, blocked)
 */
export type PlatformStatus = 'ok' | 'warning' | 'error' | 'no_link' | 'not_implemented' | 'failed';

export interface PlatformResult {
  platform: Platform;
  link: string | null;
  status: PlatformStatus;
  /** Set when status is `failed` */
  error?: string;
  checks: Check[];
  checkedAt: string;
}

/** What the runner needs to know about one person. */
export interface PersonInput {
  staffId: string;
  name: string;
  faculty: string | null;
  department: string | null;
  /** A link (or, for ORCID, the bare id) per platform; missing = not given */
  links: Partial<Record<Platform, string | null>>;
}

export interface PersonResult {
  staffId: string;
  name: string;
  faculty: string | null;
  department: string | null;
  platforms: PlatformResult[];
}

/**
 * Everything a checker may need beyond its own link — ORCID's «links» check
 * asks whether the person's other profiles are listed on the ORCID page.
 */
export interface CheckContext {
  person: PersonInput;
  fetchImpl: typeof fetch;
}

export interface PlatformChecker {
  platform: Platform;
  /** False for a placeholder: the runner reports `not_implemented` */
  implemented: boolean;
  check(link: string, context: CheckContext): Promise<Omit<PlatformResult, 'checkedAt'>>;
}

/** Worst status of a list of checks; `info` and `ok` do not count against. */
export function worstStatus(checks: readonly Check[]): 'ok' | 'warning' | 'error' {
  if (checks.some((c) => c.status === 'error')) return 'error';
  if (checks.some((c) => c.status === 'warning')) return 'warning';
  return 'ok';
}

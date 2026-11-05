import { CHECKERS } from '@/lib/profile-check/platforms';
import {
  PLATFORMS,
  type Platform,
  type PersonInput,
  type PersonResult,
  type PlatformChecker,
  type PlatformResult,
} from '@/lib/profile-check/types';

export interface RunOptions {
  checkers?: Record<string, PlatformChecker>;
  fetchImpl?: typeof fetch;
  /** See `CheckContext.countRequest` */
  countRequest?: () => void;
  now?: () => Date;
  /** Check only these platforms (a run is per platform); default: all four */
  platforms?: readonly Platform[];
}

/**
 * The profiles of one person — all four, or just `platforms`; a platform
 * without a link is `no_link`.
 */
export async function checkPerson(
  person: PersonInput,
  {
    checkers = CHECKERS,
    fetchImpl = fetch,
    countRequest,
    now = () => new Date(),
    platforms: only = PLATFORMS,
  }: RunOptions = {}
): Promise<PersonResult> {
  const platforms: PlatformResult[] = [];
  for (const platform of PLATFORMS) {
    if (!only.includes(platform)) continue;
    const link = person.links[platform]?.trim() || null;
    const checkedAt = now().toISOString();
    const checker = checkers[platform];
    if (!link) {
      platforms.push({ platform, link: null, status: 'no_link', checks: [], checkedAt });
    } else if (!checker || !checker.implemented) {
      platforms.push({ platform, link, status: 'not_implemented', checks: [], checkedAt });
    } else {
      const result = await checker.check(link, { person, fetchImpl, countRequest });
      platforms.push({ ...result, checkedAt });
    }
  }
  return {
    staffId: person.staffId,
    name: person.name,
    faculty: person.faculty,
    department: person.department,
    platforms,
  };
}

/**
 * Many people, `concurrency` at a time. The default is gentle on purpose:
 * ORCID's public API is rate limited per address and 300 people is a minute's
 * work either way. Results keep the order of the input.
 */
export async function checkPeople(
  people: readonly PersonInput[],
  options: RunOptions & {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
    /** Awaited before the next person is taken, so a save is never left behind */
    onResult?: (result: PersonResult, done: number, total: number) => Promise<void> | void;
  } = {}
): Promise<PersonResult[]> {
  const { concurrency = 4, onProgress, onResult } = options;
  const results: PersonResult[] = new Array(people.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < people.length) {
      const i = next++;
      results[i] = await checkPerson(people[i], options);
      const n = ++done;
      onProgress?.(n, people.length);
      await onResult?.(results[i], n, people.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, people.length) }, worker));
  return results;
}

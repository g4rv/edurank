import { CHECKERS } from '@/lib/profile-check/platforms';
import {
  PLATFORMS,
  type PersonInput,
  type PersonResult,
  type PlatformChecker,
  type PlatformResult,
} from '@/lib/profile-check/types';

export interface RunOptions {
  checkers?: Record<string, PlatformChecker>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** All four profiles of one person; a platform without a link is `no_link`. */
export async function checkPerson(
  person: PersonInput,
  { checkers = CHECKERS, fetchImpl = fetch, now = () => new Date() }: RunOptions = {}
): Promise<PersonResult> {
  const platforms: PlatformResult[] = [];
  for (const platform of PLATFORMS) {
    const link = person.links[platform]?.trim() || null;
    const checkedAt = now().toISOString();
    const checker = checkers[platform];
    if (!link) {
      platforms.push({ platform, link: null, status: 'no_link', checks: [], checkedAt });
    } else if (!checker || !checker.implemented) {
      platforms.push({ platform, link, status: 'not_implemented', checks: [], checkedAt });
    } else {
      const result = await checker.check(link, { person, fetchImpl });
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
  } = {}
): Promise<PersonResult[]> {
  const { concurrency = 4, onProgress } = options;
  const results: PersonResult[] = new Array(people.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < people.length) {
      const i = next++;
      results[i] = await checkPerson(people[i], options);
      onProgress?.(++done, people.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, people.length) }, worker));
  return results;
}

import { normaliseOrcid } from '@/lib/orcid';
import { BrowserUnavailableError, withBrowserPage } from '@/lib/profile-check/browser';
import { createGate, type Gate } from '@/lib/profile-check/gate';
import { worstStatus, type PlatformChecker, type PlatformResult } from '@/lib/profile-check/types';
import { checkWosAffiliation, checkWosHIndex, checkWosName, checkWosOrcid } from './checks';
import { parseWosProfile, wosRecordId } from './parse';

const PROFILE_URL = 'https://www.webofscience.com/wos/author/record/';
const WAIT_MS = 25_000;

/** What opening a profile gave. `unavailable` = there is no browser to open it with. */
export type WosOpen =
  | { kind: 'ok'; name: string; text: string }
  | { kind: 'not_found' }
  | { kind: 'blocked' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

/**
 * Opens one profile in a browser and returns what is on screen. The page is a
 * JavaScript shell, so its data exists only after it has rendered: we wait for
 * the profile's heading, or for the not-found page it redirects to. A
 * challenge page («Just a moment…») is a block — reported, never worked around.
 */
export async function openWosProfile(id: string): Promise<WosOpen> {
  try {
    return await withBrowserPage(async (page): Promise<WosOpen> => {
      await page.goto(`${PROFILE_URL}${encodeURIComponent(id)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      const profile = page.waitForSelector('h1.wat-author-name', { timeout: WAIT_MS }).then(
        () => 'profile' as const,
        () => null
      );
      const missing = page.waitForURL(/authorNotFound/, { timeout: WAIT_MS }).then(
        () => 'not_found' as const,
        () => null
      );
      const outcome = await Promise.race([profile, missing]);

      if (outcome === 'not_found') return { kind: 'not_found' };
      if (outcome === null) {
        // Neither came. A challenge page says so in its title or text
        const seen = await page
          .evaluate(() => `${document.title} ${document.body?.innerText.slice(0, 400) ?? ''}`)
          .catch(() => '');
        return /just a moment|verify you are human|attention required|access denied/i.test(seen)
          ? { kind: 'blocked' }
          : { kind: 'error', message: 'Сторінка профілю WoS не завантажилась' };
      }

      const name = (await page.locator('h1.wat-author-name').first().innerText()).trim();
      // The metrics arrive after the heading
      await page
        .waitForFunction(() => document.body.innerText.includes('H-Index'), null, {
          timeout: 10_000,
        })
        .catch(() => {});
      const text = await page.evaluate(() => document.body.innerText);
      return { kind: 'ok', name, text };
    });
  } catch (e) {
    if (e instanceof BrowserUnavailableError) return { kind: 'unavailable' };
    return { kind: 'error', message: e instanceof Error ? e.message : 'Помилка браузера' };
  }
}

/** WoS's own door: a profile takes about 8 s to render, so about 3 s apart is plenty */
const wosGate: Gate = createGate({ gapMs: 3000, jitterMs: 700 });

type Result = Omit<PlatformResult, 'checkedAt'>;

function failed(link: string, error: string): Result {
  return { platform: 'wos', link, status: 'failed', error, checks: [] };
}

/**
 * Web of Science, read through a browser: no API key is needed for the
 * profile page, but Clarivate's terms and Cloudflare's checks are the owner's
 * to weigh (see `browser.ts`). If the site challenges us, or there is no
 * browser on the server, the platform is `failed` with that reason and the
 * run goes on.
 */
export function createWosChecker(
  gate: Gate = wosGate,
  open: (id: string) => Promise<WosOpen> = openWosProfile
): PlatformChecker {
  return {
    platform: 'wos',
    implemented: true,
    async check(link, { person }) {
      const id = wosRecordId(link);
      if (!id) {
        return {
          platform: 'wos',
          link,
          status: 'error',
          checks: [
            {
              field: 'profile',
              current: link,
              shouldBe: 'Посилання на профіль: webofscience.com/wos/author/record/…',
              status: 'error',
              message: 'У посиланні немає ідентифікатора профілю (author/record/…)',
            },
          ],
        };
      }
      const canonical = `${PROFILE_URL}${id}`;

      const wait = gate.blockedFor();
      if (wait > 0) {
        return failed(
          canonical,
          `Web of Science тимчасово обмежив запити — спробуйте приблизно за ${Math.max(1, Math.ceil(wait / 60_000))} хв`
        );
      }

      await gate.wait();
      const got = await open(id);

      if (got.kind === 'blocked') {
        gate.block();
        return failed(canonical, 'Web of Science вимагає перевірки браузера — спробуйте пізніше');
      }
      if (got.kind === 'unavailable') {
        return failed(
          canonical,
          'Браузер для перевірки Web of Science недоступний на сервері. Задайте PROFILE_BROWSER_CHANNEL, PROFILE_BROWSER_PATH або PROFILE_BROWSER_WS'
        );
      }
      if (got.kind === 'error') return failed(canonical, got.message);
      if (got.kind === 'not_found') {
        return {
          platform: 'wos',
          link: canonical,
          status: 'error',
          checks: [
            {
              field: 'profile',
              current: link,
              shouldBe: 'Профіль Web of Science, що існує',
              status: 'error',
              message: 'Профіль не знайдено — перевірте посилання',
            },
          ],
        };
      }

      const profile = parseWosProfile({ name: got.name, text: got.text });
      if (!profile) return failed(canonical, 'Сторінка профілю має незнайому будову');

      const checks = [
        checkWosOrcid(profile, normaliseOrcid(person.links.orcid)),
        checkWosName(profile),
        checkWosAffiliation(profile),
        checkWosHIndex(profile),
      ];
      return { platform: 'wos', link: canonical, status: worstStatus(checks), checks };
    },
  };
}

export const wosChecker = createWosChecker();

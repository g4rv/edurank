/**
 * A real browser for the pages that are only a JavaScript shell without one —
 * today, Web of Science. Playwright, the TypeScript counterpart of the Selenium
 * the old Python tool used.
 *
 * **Honest on purpose.** Nothing here hides that it is a script: no stealth
 * flags, no spoofed agent, no hidden `webdriver`. If a site answers it with a
 * challenge page, the check says so and stops; it does not try to look human.
 *
 * Where the browser comes from. If one of these is set, ONLY it is tried (first
 * that is set wins):
 * - `PROFILE_BROWSER_WS` — connect to a browser running elsewhere, a separate
 *   container for instance, so the app's own image stays small;
 * - `PROFILE_BROWSER_PATH` — the executable of a Chrome/Chromium on this machine;
 * - `PROFILE_BROWSER_CHANNEL` — `chrome` or `msedge`, the one installed here.
 *
 * With none set, whatever is on the machine is tried in turn — Playwright's own
 * Chromium, then Google Chrome, then Microsoft Edge — so a developer's laptop
 * works without any setting. A server image has none of them, and says so.
 *
 * When nothing starts, `BrowserUnavailableError` carries WHY, for every
 * candidate, and it is logged once: «недоступний» with no reason cost an
 * afternoon of guessing. The failure is remembered for a minute so a run of 150
 * people does not retry the launch 150 times.
 */
import type { Browser, Page } from 'playwright-core';
import { logWarning } from '@/lib/log';

export class BrowserUnavailableError extends Error {}

/** The browser is closed after this long unused: Chromium is hundreds of MB. */
const IDLE_MS = 60_000;
/** After a failed start, do not try again for this long. */
const RETRY_AFTER_MS = 60_000;

let browserPromise: Promise<Browser> | null = null;
let active = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let failed: { until: number; error: BrowserUnavailableError } | null = null;

interface Candidate {
  label: string;
  start: () => Promise<Browser>;
}

async function candidates(): Promise<Candidate[]> {
  const { chromium } = await import('playwright-core');
  const ws = process.env.PROFILE_BROWSER_WS;
  const path = process.env.PROFILE_BROWSER_PATH;
  const channel = process.env.PROFILE_BROWSER_CHANNEL;

  if (ws) return [{ label: 'PROFILE_BROWSER_WS', start: () => chromium.connect(ws) }];
  if (path) {
    return [
      {
        label: 'PROFILE_BROWSER_PATH',
        start: () => chromium.launch({ headless: true, executablePath: path }),
      },
    ];
  }
  if (channel) {
    return [
      {
        label: `PROFILE_BROWSER_CHANNEL=${channel}`,
        start: () => chromium.launch({ headless: true, channel }),
      },
    ];
  }
  return [
    { label: 'Chromium від Playwright', start: () => chromium.launch({ headless: true }) },
    {
      label: 'Google Chrome',
      start: () => chromium.launch({ headless: true, channel: 'chrome' }),
    },
    {
      label: 'Microsoft Edge',
      start: () => chromium.launch({ headless: true, channel: 'msedge' }),
    },
  ];
}

async function launch(): Promise<Browser> {
  const reasons: string[] = [];
  let list: Candidate[];
  try {
    list = await candidates();
  } catch (e) {
    // The driver itself would not load (a file missing from the build): the same
    // «no browser» answer, with the real reason, not a raw module error.
    const first = (e instanceof Error ? e.message : String(e)).split('\n')[0];
    throw new BrowserUnavailableError(`playwright-core: ${first}`);
  }
  for (const c of list) {
    try {
      return await c.start();
    } catch (e) {
      const first = (e instanceof Error ? e.message : String(e)).split('\n')[0];
      reasons.push(`${c.label}: ${first}`);
    }
  }
  throw new BrowserUnavailableError(reasons.join(' | '));
}

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (active > 0 || !browserPromise) return;
    const closing = browserPromise;
    browserPromise = null;
    void closing.then((b) => b.close()).catch(() => {});
  }, IDLE_MS);
  // A pending close must not keep the server (or a script) alive
  idleTimer.unref?.();
}

async function getBrowser(): Promise<Browser> {
  if (failed && Date.now() < failed.until) throw failed.error;

  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.isConnected()) return existing;
    browserPromise = null; // crashed or closed behind our back
  }
  browserPromise = launch().catch((e) => {
    browserPromise = null;
    if (e instanceof BrowserUnavailableError) {
      failed = { until: Date.now() + RETRY_AFTER_MS, error: e };
      logWarning('profileCheck.browser', `no browser could be started — ${e.message}`);
    }
    throw e;
  });
  return browserPromise;
}

/** One page in its own context (no cookies shared between checks), then gone. */
export async function withBrowserPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  active += 1;
  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      locale: 'en-US',
      viewport: { width: 1280, height: 900 },
    });
    try {
      return await fn(await context.newPage());
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    active -= 1;
    if (active === 0) scheduleIdleClose();
  }
}

/** For scripts and tests: close now instead of waiting for the idle timer. */
export async function closeBrowser(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  const closing = browserPromise;
  browserPromise = null;
  failed = null;
  await closing?.then((b) => b.close()).catch(() => {});
}

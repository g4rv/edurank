/**
 * A real browser for the pages that are only a JavaScript shell without one —
 * today, Web of Science. Playwright, the TypeScript counterpart of the Selenium
 * the old Python tool used.
 *
 * **Honest on purpose.** Nothing here hides that it is a script: no stealth
 * flags, no spoofed agent, no hidden `webdriver`. If a site answers it with a
 * challenge page, the check says so and stops; it does not try to look human.
 *
 * Where the browser comes from (first that is set wins):
 * - `PROFILE_BROWSER_WS` — connect to a browser running elsewhere, a separate
 *   container for instance, so the app's own image stays small;
 * - `PROFILE_BROWSER_PATH` — the executable of a Chrome/Chromium on this machine;
 * - `PROFILE_BROWSER_CHANNEL` — `chrome` or `msedge`, the one installed here;
 * - otherwise Playwright's own Chromium, if it was ever installed.
 *
 * When none works, `BrowserUnavailableError` — the check reports «браузер
 * недоступний» for that platform and nothing else breaks.
 */
import type { Browser, Page } from 'playwright-core';

export class BrowserUnavailableError extends Error {}

/** The browser is closed after this long unused: Chromium is hundreds of MB. */
const IDLE_MS = 60_000;

let browserPromise: Promise<Browser> | null = null;
let active = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function launch(): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  try {
    const ws = process.env.PROFILE_BROWSER_WS;
    if (ws) return await chromium.connect(ws);
    return await chromium.launch({
      headless: true,
      executablePath: process.env.PROFILE_BROWSER_PATH || undefined,
      channel: process.env.PROFILE_BROWSER_CHANNEL || undefined,
    });
  } catch (e) {
    throw new BrowserUnavailableError(e instanceof Error ? e.message : 'browser did not start');
  }
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
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.isConnected()) return existing;
    browserPromise = null; // crashed or closed behind our back
  }
  browserPromise = launch().catch((e) => {
    browserPromise = null;
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
  await closing?.then((b) => b.close()).catch(() => {});
}

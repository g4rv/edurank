import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The launcher with a fake `playwright-core`: which browsers are tried, in what
 * order, what the failure says, and that a failure is not retried at once.
 */
const launch = vi.fn();
const connect = vi.fn();
vi.mock('playwright-core', () => ({ chromium: { launch, connect } }));

const warn = vi.fn();
vi.mock('@/lib/log', () => ({ logWarning: warn, logError: vi.fn() }));

const fakeBrowser = () => ({
  isConnected: () => true,
  close: async () => {},
  newContext: async () => ({
    newPage: async () => ({ fake: 'page' }),
    close: async () => {},
  }),
});

async function load() {
  vi.resetModules();
  return await import('./browser');
}

const ENV = ['PROFILE_BROWSER_WS', 'PROFILE_BROWSER_PATH', 'PROFILE_BROWSER_CHANNEL'];

beforeEach(() => {
  launch.mockReset();
  connect.mockReset();
  warn.mockReset();
  for (const k of ENV) delete process.env[k];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('which browser is tried', () => {
  it('with nothing set: Playwright’s own, then Chrome, then Edge — the first that starts wins', async () => {
    launch.mockRejectedValueOnce(new Error("Executable doesn't exist\nmore detail"));
    launch.mockResolvedValueOnce(fakeBrowser());
    const { withBrowserPage, closeBrowser } = await load();

    await withBrowserPage(async () => 'done');

    expect(launch).toHaveBeenCalledTimes(2);
    expect(launch.mock.calls[0][0]).toEqual({ headless: true });
    expect(launch.mock.calls[1][0]).toEqual({ headless: true, channel: 'chrome' });
    await closeBrowser();
  });

  it('with a channel set: only that one, never the others', async () => {
    process.env.PROFILE_BROWSER_CHANNEL = 'msedge';
    launch.mockResolvedValueOnce(fakeBrowser());
    const { withBrowserPage, closeBrowser } = await load();

    await withBrowserPage(async () => 'done');

    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch.mock.calls[0][0]).toEqual({ headless: true, channel: 'msedge' });
    await closeBrowser();
  });

  it('with a path set: that executable', async () => {
    process.env.PROFILE_BROWSER_PATH = 'C:/x/chrome.exe';
    launch.mockResolvedValueOnce(fakeBrowser());
    const { withBrowserPage, closeBrowser } = await load();
    await withBrowserPage(async () => 'done');
    expect(launch.mock.calls[0][0]).toEqual({ headless: true, executablePath: 'C:/x/chrome.exe' });
    await closeBrowser();
  });

  it('with a remote browser set: connects instead of launching', async () => {
    process.env.PROFILE_BROWSER_WS = 'ws://browser:3000';
    connect.mockResolvedValueOnce(fakeBrowser());
    const { withBrowserPage, closeBrowser } = await load();
    await withBrowserPage(async () => 'done');
    expect(connect).toHaveBeenCalledWith('ws://browser:3000');
    expect(launch).not.toHaveBeenCalled();
    await closeBrowser();
  });
});

describe('when no browser starts', () => {
  it('says WHY for every candidate, and logs it once', async () => {
    launch.mockRejectedValue(new Error('not installed'));
    const { withBrowserPage, BrowserUnavailableError } = await load();

    const err = await withBrowserPage(async () => 1).catch((e) => e);
    expect(err).toBeInstanceOf(BrowserUnavailableError);
    expect(err.message).toContain('Chromium від Playwright: not installed');
    expect(err.message).toContain('Google Chrome: not installed');
    expect(err.message).toContain('Microsoft Edge: not installed');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not retry the launch for a minute, then tries again', async () => {
    launch.mockRejectedValue(new Error('nope'));
    const { withBrowserPage } = await load();

    await withBrowserPage(async () => 1).catch(() => {});
    const attempts = launch.mock.calls.length;
    await withBrowserPage(async () => 1).catch(() => {}); // a second person, a second later
    expect(launch.mock.calls.length).toBe(attempts);
    expect(warn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(61_000);
    await withBrowserPage(async () => 1).catch(() => {});
    expect(launch.mock.calls.length).toBeGreaterThan(attempts);
  });
});

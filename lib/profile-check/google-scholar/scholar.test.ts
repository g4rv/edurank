import { describe, expect, it, vi } from 'vitest';
import { createScholarChecker } from './index';
import { createGate } from './gate';
import { fetchScholarProfile } from './fetch';
import { looksBlocked, parseScholarProfile, scholarUserId } from './parse';

/** The parts of a profile page the parser reads, with Scholar's own class names */
const PAGE = `<html><body>
<div id="gsc_prf_in">Viktor Melnyk (ORCID 0000-0002-7439-1564)</div>
<table id="gsc_rsb_st"><tbody>
<tr><td class="gsc_rsb_sc1"><a class="gsc_rsb_f">Citations</a></td><td class="gsc_rsb_std">3331</td><td class="gsc_rsb_std">627</td></tr>
<tr><td class="gsc_rsb_sc1"><a class="gsc_rsb_f">h-index</a></td><td class="gsc_rsb_std">30</td><td class="gsc_rsb_std">12</td></tr>
<tr><td class="gsc_rsb_sc1"><a class="gsc_rsb_f">i10-index</a></td><td class="gsc_rsb_std">68</td><td class="gsc_rsb_std">20</td></tr>
</tbody></table></body></html>`;

const ID = 'kBDGqCQAAAAJ';
const LINK = `https://scholar.google.com.ua/citations?user=${ID}&hl=uk&oi=ao`;
const person = { staffId: 's', name: 'x', faculty: null, department: null, links: {} };
const open = () => createGate({ gapMs: 0, jitterMs: 0, sleep: async () => {} });

function respond(status: number, body = '', headers: Record<string, string> = {}): typeof fetch {
  return (async () => new Response(body, { status, headers })) as typeof fetch;
}

describe('parseScholarProfile', () => {
  it('reads the name and the six cells by position', () => {
    expect(parseScholarProfile(PAGE)).toEqual({
      name: 'Viktor Melnyk (ORCID 0000-0002-7439-1564)',
      stats: {
        citations: { all: 3331, recent: 627 },
        hIndex: { all: 30, recent: 12 },
        i10Index: { all: 68, recent: 20 },
      },
    });
  });

  it('is not a profile without the name block', () => {
    expect(parseScholarProfile('<html>nothing</html>')).toBeNull();
  });

  it('keeps the name but no numbers when the table changed shape', () => {
    const odd = PAGE.replace('<td class="gsc_rsb_std">20</td>', '');
    expect(parseScholarProfile(odd)).toEqual({ name: expect.any(String), stats: null });
  });
});

describe('scholarUserId', () => {
  it('finds the id wherever it sits in the query', () => {
    expect(scholarUserId(LINK)).toBe(ID);
    expect(scholarUserId(`https://scholar.google.com/citations?hl=uk&user=${ID}`)).toBe(ID);
  });
  it('refuses a link with no profile id', () => {
    expect(scholarUserId('https://scholar.google.com/')).toBeNull();
    expect(scholarUserId('https://scholar.google.com/citations?user=short')).toBeNull();
  });
});

describe('looksBlocked', () => {
  it('knows a CAPTCHA page, and is not fooled by the harmless «Sorry» banner', () => {
    expect(looksBlocked('<form id="captcha-form">')).toBe(true);
    expect(
      looksBlocked('<div class="gs_alrt">Sorry, some features may not work in this browser</div>')
    ).toBe(false);
  });
});

describe('fetchScholarProfile', () => {
  it('reads a page', async () => {
    expect(await fetchScholarProfile(ID, respond(200, PAGE))).toEqual({ kind: 'ok', html: PAGE });
  });
  it('treats a redirect to the login page as «no such profile»', async () => {
    const f = respond(302, '', { location: 'https://accounts.google.com/Login?x=1' });
    expect(await fetchScholarProfile(ID, f)).toEqual({ kind: 'not_found' });
  });
  it('treats /sorry, 429 and a CAPTCHA body as a block', async () => {
    expect(
      await fetchScholarProfile(
        ID,
        respond(302, '', { location: 'https://www.google.com/sorry/index' })
      )
    ).toEqual({ kind: 'blocked' });
    expect(await fetchScholarProfile(ID, respond(429))).toEqual({ kind: 'blocked' });
    expect(await fetchScholarProfile(ID, respond(200, '<form id="captcha-form">'))).toEqual({
      kind: 'blocked',
    });
  });
  it('reports a network failure as an error, never throws', async () => {
    const down = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await fetchScholarProfile(ID, down)).toEqual({ kind: 'error', message: 'offline' });
  });
});

describe('the Scholar checker', () => {
  it('records the h-index, citations and i10-index as ok checks', async () => {
    const r = await createScholarChecker(open()).check(LINK, {
      person,
      fetchImpl: respond(200, PAGE),
    });
    expect(r.status).toBe('ok');
    expect(r.link).toBe(`https://scholar.google.com/citations?user=${ID}`);
    expect(r.checks.find((c) => c.field === 'h_index')?.current).toEqual({ all: 30, recent: 12 });
    expect(r.checks.every((c) => c.status === 'ok')).toBe(true);
  });

  it('errors on a link with no profile id, without any request', async () => {
    const f = vi.fn();
    const r = await createScholarChecker(open()).check('https://scholar.google.com/', {
      person,
      fetchImpl: f as never,
    });
    expect(r.status).toBe('error');
    expect(f).not.toHaveBeenCalled();
  });

  it('errors on a profile that does not exist or is private', async () => {
    const f = respond(302, '', { location: 'https://accounts.google.com/Login' });
    expect((await createScholarChecker(open()).check(LINK, { person, fetchImpl: f })).status).toBe(
      'error'
    );
  });

  it('warns when the page has a profile but no numbers', async () => {
    const odd = PAGE.replace('<td class="gsc_rsb_std">20</td>', '');
    const r = await createScholarChecker(open()).check(LINK, {
      person,
      fetchImpl: respond(200, odd),
    });
    expect(r.status).toBe('warning');
  });

  it('after a block, fails the rest fast without asking Google again', async () => {
    let t = 0;
    const gate = createGate({
      gapMs: 0,
      jitterMs: 0,
      cooldownMs: 600_000,
      now: () => t,
      sleep: async () => {},
    });
    const f = vi.fn(respond(429));
    const checker = createScholarChecker(gate);
    const first = await checker.check(LINK, { person, fetchImpl: f as never });
    const second = await checker.check(LINK, { person, fetchImpl: f as never });
    expect(first.status).toBe('failed');
    expect(second.error).toMatch(/спробуйте/);
    expect(f).toHaveBeenCalledTimes(1);

    t = 600_001; // the cooldown is over
    await checker.check(LINK, { person, fetchImpl: f as never });
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('createGate', () => {
  it('spaces concurrent callers one gap apart', async () => {
    const t = 1000;
    const slept: number[] = [];
    const gate = createGate({
      gapMs: 2000,
      jitterMs: 0,
      now: () => t,
      sleep: async (ms) => void slept.push(ms),
    });
    await Promise.all([gate.wait(), gate.wait(), gate.wait()]);
    expect(slept).toEqual([2000, 4000]); // the first goes at once
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createScholarChecker } from './index';
import {
  checkScholarDescription,
  checkScholarHomepage,
  checkScholarKeywords,
  checkScholarName,
  checkScholarVerifiedEmail,
  checkScholarWorks,
} from './checks';
import { createGate } from '@/lib/profile-check/gate';
import { fetchScholarProfile } from './fetch';
import { looksBlocked, parseScholarProfile, scholarUserId } from './parse';

/** The parts of a profile page the parser reads, with Scholar's own class names */
function page({
  name = 'Iryna Kamenska (ORCID  0000-0003-2872-5065)',
  affiliation = 'Hryhorii Skovoroda University in Pereiaslav (https://ror.org/01p07y544). UKRAINE',
  years = [2026, 2025],
  cells = ['3331', '627', '30', '12', '68', '20'],
  email = 'uhsp.edu.ua',
  homepage = 'https://uhsp.edu.ua/personnel/kamenska-iryna-stepanivna/',
  keywords = ['education', 'media'],
}: {
  name?: string;
  affiliation?: string | null;
  years?: (number | null)[];
  cells?: string[];
  /** The verified domain; null renders «No verified email» */
  email?: string | null;
  homepage?: string | null;
  keywords?: string[];
} = {}) {
  const rows = years
    .map(
      (y, i) =>
        `<tr class="gsc_a_tr"><td class="gsc_a_t"><a href="/x" class="gsc_a_at">Article ${i + 1}</a></td>` +
        `<td class="gsc_a_y"><span class="gsc_a_h gsc_a_hc gs_ibl">${y ?? ''}</span></td></tr>`
    )
    .join('');
  const [c1, c2, h1, h2, i1, i2] = cells;
  return `<html><body>
<div id="gsc_prf_in">${name}</div>
${affiliation === null ? '' : `<div class="gsc_prf_il">${affiliation}</div>`}
${
  email === null
    ? '<div class="gsc_prf_il" id="gsc_prf_ivh">No verified email</div>'
    : `<div class="gsc_prf_il" id="gsc_prf_ivh">Verified email at ${email}${homepage ? ` - <a href="${homepage}" class="gsc_prf_ila" rel="nofollow">Homepage</a>` : ''}</div>`
}
${keywords.length ? `<div class="gsc_prf_il" id="gsc_prf_int">${keywords.map((k) => `<a href="/citations?mauthors=label:${k}" class="gs_ibl gsc_prf_inta">${k}</a>`).join('')}</div>` : ''}
<table id="gsc_rsb_st"><tbody>
<tr><td class="gsc_rsb_std">${c1}</td><td class="gsc_rsb_std">${c2}</td></tr>
<tr><td class="gsc_rsb_std">${h1}</td><td class="gsc_rsb_std">${h2}</td></tr>
<tr><td class="gsc_rsb_std">${i1}</td><td class="gsc_rsb_std">${i2}</td></tr>
</tbody></table>
<table><tbody>${rows}</tbody></table></body></html>`;
}
const PAGE = page();
const OWN_ORCID = '0000-0003-2872-5065';

const ID = 'kBDGqCQAAAAJ';
const LINK = `https://scholar.google.com.ua/citations?user=${ID}&hl=uk&oi=ao`;
const person = {
  staffId: 's',
  name: 'x',
  faculty: null,
  department: null,
  links: { orcid: OWN_ORCID },
};
const NOW = () => new Date('2026-11-05T10:00:00Z');
const open = () => createGate({ gapMs: 0, jitterMs: 0, sleep: async () => {} });

function respond(status: number, body = '', headers: Record<string, string> = {}): typeof fetch {
  return (async () => new Response(body, { status, headers })) as typeof fetch;
}

describe('parseScholarProfile', () => {
  it('reads the name, the description, the articles and the six cells by position', () => {
    expect(parseScholarProfile(PAGE)).toEqual({
      name: 'Iryna Kamenska (ORCID 0000-0003-2872-5065)',
      affiliation:
        'Hryhorii Skovoroda University in Pereiaslav (https://ror.org/01p07y544). UKRAINE',
      articles: [
        { title: 'Article 1', year: 2026 },
        { title: 'Article 2', year: 2025 },
      ],
      verifiedDomain: 'uhsp.edu.ua',
      homepage: 'https://uhsp.edu.ua/personnel/kamenska-iryna-stepanivna/',
      keywords: ['education', 'media'],
      stats: {
        citations: { all: 3331, recent: 627 },
        hIndex: { all: 30, recent: 12 },
        i10Index: { all: 68, recent: 20 },
      },
    });
  });

  it('does not take the verified-email line for the description', () => {
    expect(parseScholarProfile(page({ affiliation: null }))?.affiliation).toBeNull();
  });

  it('reads an article with no year as null', () => {
    expect(parseScholarProfile(page({ years: [null, 2025] }))?.articles.map((a) => a.year)).toEqual(
      [null, 2025]
    );
  });

  it('is not a profile without the name block', () => {
    expect(parseScholarProfile('<html>nothing</html>')).toBeNull();
  });

  it('keeps the name but no numbers when the table changed shape', () => {
    const odd = PAGE.replace('<td class="gsc_rsb_std">20</td>', '');
    expect(parseScholarProfile(odd)?.stats).toBeNull();
    expect(parseScholarProfile(odd)?.name).toContain('Kamenska');
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
    const r = await createScholarChecker(open(), NOW).check(LINK, {
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
    const r = await createScholarChecker(open(), NOW).check('https://scholar.google.com/', {
      person,
      fetchImpl: f as never,
    });
    expect(r.status).toBe('error');
    expect(f).not.toHaveBeenCalled();
  });

  it('errors on a profile that does not exist or is private', async () => {
    const f = respond(302, '', { location: 'https://accounts.google.com/Login' });
    expect(
      (await createScholarChecker(open(), NOW).check(LINK, { person, fetchImpl: f })).status
    ).toBe('error');
  });

  it('warns when the page has a profile but no numbers', async () => {
    const odd = PAGE.replace('<td class="gsc_rsb_std">20</td>', '');
    const r = await createScholarChecker(open(), NOW).check(LINK, {
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
    const checker = createScholarChecker(gate, NOW);
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

const profile = (over: Parameters<typeof page>[0] = {}) => parseScholarProfile(page(over))!;

describe('checkScholarName', () => {
  it('passes «Name (ORCID id)» with the person’s own ORCID', () => {
    expect(checkScholarName(profile(), OWN_ORCID).status).toBe('ok');
  });

  it('errors when the name carries no ORCID', () => {
    const c = checkScholarName(profile({ name: 'Iryna Kamenska' }), OWN_ORCID);
    expect(c.status).toBe('error');
    expect(c.message).toMatch(/немає ORCID/);
  });

  it('errors when the ORCID in the name is somebody else’s, and names both', () => {
    const c = checkScholarName(
      profile({ name: 'Iryna Kamenska (ORCID 0000-0001-1111-1111)' }),
      OWN_ORCID
    );
    expect(c.status).toBe('error');
    expect(c.message).toContain('0000-0001-1111-1111');
    expect(c.message).toContain(OWN_ORCID);
  });

  it('errors on a Cyrillic name, and on Cyrillic letters that only look Latin', () => {
    expect(
      checkScholarName(profile({ name: 'Ірина Каменська (ORCID 0000-0003-2872-5065)' }), OWN_ORCID)
        .message
    ).toMatch(/не латиницею/);
    // the «а» in Kаmenska is Cyrillic
    expect(
      checkScholarName(profile({ name: 'Iryna Kаmenska (ORCID 0000-0003-2872-5065)' }), OWN_ORCID)
        .message
    ).toMatch(/схожі на латинські/);
  });

  it('only advises on another spelling of the same ORCID', () => {
    const c = checkScholarName(
      profile({ name: 'Iryna Kamenska (orcid.org/0000-0003-2872-5065)' }),
      OWN_ORCID
    );
    expect(c.status).toBe('info');
  });

  it('has nothing to compare to when the system holds no ORCID, and says so by passing', () => {
    expect(checkScholarName(profile(), null).status).toBe('ok');
  });
});

describe('checkScholarWorks', () => {
  it('passes a latest article from this year or last', () => {
    expect(checkScholarWorks(profile({ years: [2026] }), NOW()).status).toBe('ok');
    expect(checkScholarWorks(profile({ years: [2025] }), NOW()).status).toBe('ok');
  });

  it('only recommends when the newest is older — never an error', () => {
    const c = checkScholarWorks(profile({ years: [2024, 2023] }), NOW());
    expect(c.status).toBe('info');
    expect(c.message).toBe('Якщо у вас є актуальні публікації, будь ласка, додайте їх до списку');
    expect(c.current).toEqual({ title: 'Article 1', year: '2024' });
  });

  it('takes the newest year of the page, not the first row', () => {
    expect(checkScholarWorks(profile({ years: [null, 2019, 2026] }), NOW()).status).toBe('ok');
  });

  it('recommends with no articles at all, and when none has a year', () => {
    expect(checkScholarWorks(profile({ years: [] }), NOW()).status).toBe('info');
    expect(checkScholarWorks(profile({ years: [null] }), NOW()).status).toBe('info');
  });

  it('judges against the clock it is given', () => {
    expect(checkScholarWorks(profile({ years: [2026] }), new Date('2029-01-01')).status).toBe(
      'info'
    );
  });
});

describe('checkScholarDescription', () => {
  it('passes the reference description', () => {
    expect(checkScholarDescription(profile()).status).toBe('ok');
  });

  it('accepts the Ukrainian name of the university', () => {
    const d = 'Університет Григорія Сковороди в Переяславі (https://ror.org/01p07y544). UKRAINE';
    expect(checkScholarDescription(profile({ affiliation: d })).status).toBe('ok');
  });

  it('errors on an empty description', () => {
    expect(checkScholarDescription(profile({ affiliation: null })).status).toBe('error');
  });

  it('errors when the ROR link is missing, and when the name is another university', () => {
    const noRor = checkScholarDescription(
      profile({ affiliation: 'Hryhorii Skovoroda University in Pereiaslav. UKRAINE' })
    );
    expect(noRor.status).toBe('error');
    expect(noRor.message).toMatch(/ROR/);
    const other = checkScholarDescription(
      profile({ affiliation: 'National Academy of Statistics. UKRAINE' })
    );
    expect(other.message).toMatch(/немає назви університету і немає посилання ROR/);
  });

  it('does not accept a misspelled university', () => {
    const d = 'Hryhorii Skovoroda University in Pereyaslav (https://ror.org/01p07y544) Ukraine';
    expect(checkScholarDescription(profile({ affiliation: d })).status).toBe('error');
  });

  it('only advises when the country is missing', () => {
    const d = 'Hryhorii Skovoroda University in Pereiaslav (https://ror.org/01p07y544)';
    expect(checkScholarDescription(profile({ affiliation: d })).status).toBe('info');
  });
});

describe('the Scholar checker, whole', () => {
  it('passes the reference profile and records its numbers', async () => {
    const r = await createScholarChecker(open(), NOW).check(LINK, {
      person,
      fetchImpl: respond(200, PAGE),
    });
    expect(r.status).toBe('ok');
    expect(r.checks.map((c) => c.field)).toEqual([
      'name',
      'most_recent_work',
      'description',
      'verified_email',
      'homepage',
      'keywords',
      'h_index',
      'citations',
      'i10_index',
    ]);
  });

  it('fails the platform when any rule fails', async () => {
    const bad = page({ affiliation: 'Somewhere Else' });
    const r = await createScholarChecker(open(), NOW).check(LINK, {
      person,
      fetchImpl: respond(200, bad),
    });
    expect(r.status).toBe('error');
  });

  it('compares the name with the ORCID the system holds', async () => {
    const other = { ...person, links: { orcid: '0000-0001-1111-1111' } };
    const r = await createScholarChecker(open(), NOW).check(LINK, {
      person: other,
      fetchImpl: respond(200, PAGE),
    });
    expect(r.checks.find((c) => c.field === 'name')?.status).toBe('error');
  });
});

describe('the verified email and the homepage', () => {
  it('reads both from the «Verified email at … - Homepage» line, whatever the language', () => {
    const p = profile();
    expect(p.verifiedDomain).toBe('uhsp.edu.ua');
    expect(p.homepage).toBe('https://uhsp.edu.ua/personnel/kamenska-iryna-stepanivna/');
    expect(profile({ email: null }).verifiedDomain).toBeNull();
    expect(profile({ email: null }).homepage).toBeNull();
  });

  it('passes the university domain, errors on none and on another one', () => {
    expect(checkScholarVerifiedEmail(profile()).status).toBe('ok');
    const none = checkScholarVerifiedEmail(profile({ email: null }));
    expect(none.status).toBe('error');
    expect(none.message).toBe('Електронну адресу не підтверджено');
    const other = checkScholarVerifiedEmail(profile({ email: 'gmail.com' }));
    expect(other.status).toBe('error');
    expect(other.message).toContain('gmail.com');
  });

  it('passes the personal page on the university site, errors on none or another link', () => {
    expect(checkScholarHomepage(profile()).status).toBe('ok');
    expect(checkScholarHomepage(profile({ homepage: null })).status).toBe('error');
    const other = checkScholarHomepage(profile({ homepage: 'https://example.com/me' }));
    expect(other.status).toBe('error');
    expect(other.message).toContain('сайті університету');
  });

  it('fails the platform when they are missing', async () => {
    const r = await createScholarChecker(open(), NOW).check(LINK, {
      person,
      fetchImpl: respond(200, page({ email: null })),
    });
    expect(r.status).toBe('error');
    expect(r.checks.map((c) => c.field)).toEqual(
      expect.arrayContaining(['verified_email', 'homepage', 'keywords'])
    );
  });
});

describe('keywords', () => {
  it('are read one per interest', () => {
    expect(profile({ keywords: ['a', 'b'] }).keywords).toEqual(['a', 'b']);
    expect(profile({ keywords: [] }).keywords).toEqual([]);
  });

  it('are advice: present is ok, none is only a recommendation', () => {
    expect(checkScholarKeywords(profile()).status).toBe('ok');
    const none = checkScholarKeywords(profile({ keywords: [] }));
    expect(none.status).toBe('info');
    expect(none.message).toBe('Рекомендовано додати ключові слова');
  });
});

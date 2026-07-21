import { describe, expect, it } from 'vitest';
import {
  hostMatches,
  withProtocol,
  SCOPUS_HOSTS,
  SCOPUS_OR_WOS_HOSTS,
  SCHOLAR_HOSTS,
  WOS_HOSTS,
} from './link-hosts';

describe('withProtocol', () => {
  it('leaves an absolute URL alone', () => {
    expect(withProtocol('https://www.scopus.com/x')).toBe('https://www.scopus.com/x');
    expect(withProtocol('http://apps.webofknowledge.com/x')).toBe(
      'http://apps.webofknowledge.com/x'
    );
  });

  it('adds https:// to a bare host, which is how people paste', () => {
    expect(withProtocol('www.scopus.com/record')).toBe('https://www.scopus.com/record');
  });

  it('leaves an empty value empty rather than inventing a URL', () => {
    expect(withProtocol('')).toBe('');
    expect(withProtocol('   ')).toBe('');
  });
});

describe('hostMatches', () => {
  it('accepts real Scopus record and author links', () => {
    expect(
      hostMatches('https://www.scopus.com/record/display.uri?eid=2-s2.0-85099', SCOPUS_HOSTS)
    ).toBe(true);
    expect(hostMatches('https://www.scopus.com/authid/detail.uri?authorId=7', SCOPUS_HOSTS)).toBe(
      true
    );
  });

  it('accepts Web of Science under all its names', () => {
    expect(
      hostMatches('https://www.webofscience.com/wos/woscc/full-record/WOS:000123', WOS_HOSTS)
    ).toBe(true);
    expect(hostMatches('http://apps.webofknowledge.com/full_record.do?x=1', WOS_HOSTS)).toBe(true);
    expect(hostMatches('http://gateway.isiknowledge.com/x', WOS_HOSTS)).toBe(true);
  });

  // The point of the whole module
  it('rejects a random link', () => {
    expect(hostMatches('https://example.com/paper.pdf', SCOPUS_OR_WOS_HOSTS)).toBe(false);
    expect(hostMatches('https://google.com', SCOPUS_OR_WOS_HOSTS)).toBe(false);
    expect(hostMatches('https://drive.google.com/file/d/abc', SCOPUS_OR_WOS_HOSTS)).toBe(false);
  });

  it('rejects text that is not a URL at all', () => {
    expect(hostMatches('немає', SCOPUS_OR_WOS_HOSTS)).toBe(false);
    expect(hostMatches('', SCOPUS_OR_WOS_HOSTS)).toBe(false);
  });

  it('is not fooled by the service name appearing in a path or query', () => {
    expect(hostMatches('https://example.com/scopus.com/fake', SCOPUS_HOSTS)).toBe(false);
    expect(hostMatches('https://evil.com/?q=webofscience.com', WOS_HOSTS)).toBe(false);
  });

  it('accepts a bare host with no protocol', () => {
    expect(hostMatches('www.scopus.com/record/display.uri', SCOPUS_HOSTS)).toBe(true);
  });

  it('accepts university proxy rewrites', () => {
    expect(hostMatches('https://www.scopus.com.proxy.uni.edu/record', SCOPUS_HOSTS)).toBe(true);
    expect(hostMatches('https://www-scopus-com.proxy.uni.edu/record', SCOPUS_HOSTS)).toBe(true);
  });

  it('matches Google Scholar on its regional domains', () => {
    expect(hostMatches('https://scholar.google.com/citations?user=x', SCHOLAR_HOSTS)).toBe(true);
    expect(hostMatches('https://scholar.google.com.ua/citations?user=x', SCHOLAR_HOSTS)).toBe(true);
    expect(hostMatches('https://google.com/search?q=x', SCHOLAR_HOSTS)).toBe(false);
  });

  it('keeps Scopus and WoS apart when only one is asked for', () => {
    expect(hostMatches('https://www.webofscience.com/x', SCOPUS_HOSTS)).toBe(false);
    expect(hostMatches('https://www.scopus.com/x', WOS_HOSTS)).toBe(false);
    // …but the combined list takes either
    expect(hostMatches('https://www.webofscience.com/x', SCOPUS_OR_WOS_HOSTS)).toBe(true);
    expect(hostMatches('https://www.scopus.com/x', SCOPUS_OR_WOS_HOSTS)).toBe(true);
  });
});

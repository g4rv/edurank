// Host checks for fields that expect a link to a specific service.
//
// A plain URL check only proves "this is a URL" — https://example.com passes,
// which is useless for a field labelled «Посилання Scopus / WoS». These lists
// narrow that to the services actually meant.
//
// Matching is on a substring of the hostname rather than an exact domain, so
// regional and legacy hosts keep working (webofknowledge.com is the old Web of
// Science), and so do university proxies, which rewrite the host — either as a
// subdomain (scopus.com.proxy.uni.edu) or with dashes (www-scopus-com.proxy…).

export const SCOPUS_HOSTS = ['scopus.com'] as const;

// Clarivate has renamed this twice; submissions still carry the old links
export const WOS_HOSTS = [
  'webofscience.com',
  'webofknowledge.com',
  'isiknowledge.com',
  'clarivate.com',
] as const;

export const SCHOLAR_HOSTS = ['scholar.google.'] as const;

export const SCOPUS_OR_WOS_HOSTS = [...SCOPUS_HOSTS, ...WOS_HOSTS] as const;

/** Adds https:// when the user pasted a bare host, so `www.scopus.com/…` is accepted */
export function withProtocol(input: string): string {
  const value = input.trim();
  if (!value) return value;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * True when the host is a real domain. Needed because withProtocol turns any
 * word into a parseable URL — `not-a-url` would become `https://not-a-url`,
 * which the URL parser happily accepts. Requiring a dot keeps that rejected
 * while still allowing a pasted bare host.
 */
export function hasDomainHost(url: string): boolean {
  try {
    const host = new URL(withProtocol(url)).hostname;
    return host.includes('.') && !host.startsWith('.') && !host.endsWith('.');
  } catch {
    return false;
  }
}

/** True when the URL's host matches any of the given service keywords */
export function hostMatches(url: string, needles: readonly string[]): boolean {
  let host: string;
  try {
    host = new URL(withProtocol(url)).hostname.toLowerCase();
  } catch {
    return false;
  }
  // Proxies that encode dots as dashes: www-scopus-com.proxy.uni.edu
  const undashed = host.replace(/-/g, '.');
  return needles.some((n) => host.includes(n) || undashed.includes(n));
}

/**
 * Which clicks leave a page that holds unsaved work (owner, 2026-10-16: people
 * forget «Зберегти» and walk away from what they typed).
 *
 * `beforeunload` only covers closing, refreshing and typing an address. The
 * usual way out of a form is an in-app link — the sidebar, a breadcrumb,
 * «Скасувати» — which Next.js follows without unloading anything, so the
 * browser never asks. This is the other half: given a click on a link, the
 * address it would take this tab to, or null when it leaves nothing behind.
 */

export interface ClickFacts {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

export interface AnchorFacts {
  /** The resolved, absolute `href` */
  href: string;
  target: string;
  download: boolean;
}

export function leavingTo(click: ClickFacts, anchor: AnchorFacts, current: string): string | null {
  if (click.defaultPrevented) return null;
  // A middle click or a modifier opens a new tab or window; this page stays.
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) {
    return null;
  }
  if (anchor.download || (anchor.target !== '' && anchor.target !== '_self')) return null;

  let next: URL;
  let here: URL;
  try {
    next = new URL(anchor.href, current);
    here = new URL(current);
  } catch {
    return null;
  }
  // Another site unloads this one, and `beforeunload` asks for it.
  if (next.origin !== here.origin) return null;
  // A jump within the page loses nothing.
  if (next.pathname === here.pathname && next.search === here.search) return null;
  return next.pathname + next.search + next.hash;
}

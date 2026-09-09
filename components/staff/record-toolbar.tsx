'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

/**
 * A slot on the record's tab row that the open TAB fills.
 *
 * The rating tab wants a year picker and the «незаповнені» switch there; the
 * Характеристика wants its «8 з 20 · Відповідає». Both are rendered by the tab's
 * own `page.tsx`, and the row they belong on is rendered by the `layout.tsx`
 * above it — and a layout hands its children down without receiving anything
 * back.
 *
 * ## Why a portal rather than context
 *
 * Context was tried first and is the wrong tool here: the value would be a React
 * element, which is a new object on every render, so an effect that stores it
 * re-renders the provider, which re-renders the page, which makes a new element.
 * A portal moves the DOM without moving the ownership — the controls stay
 * children of the page that made them, keep its data, and simply appear
 * somewhere else.
 *
 * ## Why the layout must not fetch this itself
 *
 * The obvious alternative is for the layout to load whatever the controls need
 * and pick by pathname. That works for the year list, which is three rows — and
 * is wrong for the Характеристика's summary, which is five years of activities
 * put through the builder. It would be loaded on the Профіль tab too, where
 * nothing shows it.
 *
 * The host renders nothing on the server, so the controls arrive on hydration
 * rather than in the first paint. They are chrome, not content: the tab body is
 * server-rendered as before.
 */
export const RECORD_TOOLBAR_ID = 'record-toolbar';

export function RecordToolbar({ children }: { children: React.ReactNode }) {
  // `useSyncExternalStore` with a subscription that never fires is the canonical
  // «am I past hydration» read: `false` on the server, `true` on the client, and
  // no `setState` inside an effect for the linter to object to. The host element
  // is the layout's, already in the document from the server render, so by the
  // time this returns `true` there is something to portal into.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  if (!mounted) return null;

  const host = document.getElementById(RECORD_TOOLBAR_ID);
  return host ? createPortal(children, host) : null;
}

/** The empty target, for the layout's tab row. */
export function RecordToolbarHost() {
  return <div id={RECORD_TOOLBAR_ID} className="flex flex-wrap items-center gap-3" />;
}

/**
 * НПП self-service — temporarily closed (owner, 2026-08-25).
 *
 * The rating and the Характеристика are shut for everybody who has one of their
 * own, so nothing is submitted while the year is being prepared. «Мій профіль»
 * and «Мої здобувачі» stay open: neither is rating data, and the second is how
 * a person still claims the здобувачі they recruited.
 *
 * **Everybody with `isNpp`, not everybody with the USER role** (owner,
 * 2026-08-25) — the same rule the pages already use. One person is routinely an
 * ADMIN, an НПП and a завідувач at once, and it is the teaching half that is
 * frozen. An ADMIN goes on reading and correcting OTHER people's rating on
 * /rating, /staff/[id]/rating and /moderation; only their own submission screens
 * close, like everybody else's.
 *
 * **A constant, deliberately — not a column and not an env var** (owner,
 * 2026-08-25). This is one temporary decision, not a setting the university
 * needs to keep making. Reopening is this one line and a deploy.
 *
 * ## To reopen
 *
 * Set `NPP_RATING_OPEN` to `true`. Nothing else changes — every gate reads it:
 *
 * - `components/staff/profile/profile-tab-row.tsx` — the «Рейтинг» and
 *   «Характеристика» tabs, greyed, with the note under the row
 * - `components/sidebar.tsx` — the whole «Додати активність» group
 * - `/profile/rating`, `/profile/kharakterystyka`, `/achievements/[section]`
 * - `createActivity` / `deleteActivity` in `app/(dashboard)/achievements/actions.ts`
 * - the own-record .xlsx in `/api/export/ratings` and `/api/export/kharakterystyka`
 *
 * The nav is greyed AND every page and action refuses on its own, because a
 * disabled link stops nobody who types the URL or leaves a tab open — the rule
 * this project keeps everywhere else.
 */

/**
 * Typed `boolean` rather than left as the literal `false`: otherwise TypeScript
 * narrows every gate to a constant and `=== true` becomes a compile error in
 * the very file somebody edits to reopen this.
 */
export const NPP_RATING_OPEN: boolean = false;

/** Short form — the sidebar tooltip and the note under the greyed links. */
export const NPP_RATING_CLOSED_NOTE = 'Тимчасово недоступно';

/** The sentence a person gets on the page itself, and back from a refused action. */
export const NPP_RATING_CLOSED_DETAIL =
  'Заповнення рейтингу та характеристики тимчасово закрито. Розділ буде відкрито пізніше.';

/**
 * The line under the greyed Рейтинг and Характеристика tabs.
 *
 * It names both sections rather than saying «недоступно» because it sits under
 * a ROW rather than beside one control: «Профіль» is on the same bar and is NOT
 * closed, so a bare «Тимчасово недоступно» would read as covering the whole
 * record.
 *
 * It hung at the foot of the sidebar's «Особисте» group until 2026-09-10, which
 * is where that argument was first made — about «Мої здобувачі» sitting above
 * it. The two links moved out of that group and became tabs, and the sentence
 * went with them.
 */
export const NPP_RATING_CLOSED_NAV_NOTE = 'Рейтинг і характеристика тимчасово недоступні';

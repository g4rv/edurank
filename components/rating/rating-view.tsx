'use client';

import * as React from 'react';
import { Switch } from '@/components/aurora/ui/switch';
import { cn } from '@/lib/utils';

/**
 * «Показувати незаповнені» — the switch, and the hiding it controls.
 *
 * The two are in separate places on the page: the switch belongs on the tab row
 * beside the year picker, which the record LAYOUT renders, while the rows it
 * hides are in the table, which the tab PAGE renders (owner, 2026-09-08). A prop
 * cannot cross that boundary — a layout hands its children down, it does not
 * receive anything back — so the state lives in a context that wraps both.
 *
 * The count travels the other way, from the table up to the switch, which is why
 * `EmptyRowsScope` reports it rather than the switch working it out. Only the
 * table knows how many indicators this person has nothing under.
 *
 * ## Why the rating table lists empty indicators at all
 *
 * It shows the WHOLE catalogue, not just what somebody has filled in —
 * deliberately, because an editor otherwise cannot tell «this person has nothing
 * under 3.7» from «3.7 does not exist», and the two people looking at one rating
 * would see different tables. The cost is that ten achievements still render as
 * sixty-odd rows.
 *
 * **The switch is on by default.** The complete додаток is what this table is
 * for; hiding two thirds of it by default would answer the question it exists to
 * answer. The switch is for the reader who already knows.
 */

type RatingView = {
  showEmpty: boolean;
  setShowEmpty: (value: boolean) => void;
  emptyCount: number;
  setEmptyCount: (value: number) => void;
};

const Ctx = React.createContext<RatingView | null>(null);

export function RatingViewProvider({ children }: { children: React.ReactNode }) {
  const [showEmpty, setShowEmpty] = React.useState(true);
  const [emptyCount, setEmptyCount] = React.useState(0);

  const value = React.useMemo(
    () => ({ showEmpty, setShowEmpty, emptyCount, setEmptyCount }),
    [showEmpty, emptyCount]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The switch itself, for the tab row.
 *
 * Renders nothing outside a provider, so a page that has no rating table on it
 * does not have to know this exists.
 */
export function EmptyRowsSwitch() {
  const view = React.useContext(Ctx);
  if (!view) return null;

  return (
    <div className="flex items-center gap-2 pr-1">
      <Switch
        id="show-empty-rows"
        checked={view.showEmpty}
        onCheckedChange={view.setShowEmpty}
        // Present at zero rather than removed. A toolbar whose contents come and
        // go reads as a rendering fault, and the control was missing from
        // exactly the ratings somebody was most likely to be looking at.
        disabled={view.emptyCount === 0}
      />
      {/* A VERB, and the thing it acts on. «Незаповнені (15)» was a noun with
          a switch beside it: it named what the switch was about and left you to
          guess whether flipping it showed them or removed them. The label on a
          switch has to describe what ON does.

          The `title` answers the second question — «незаповнені» what? — for
          the reader who has not yet worked out that this table lists the whole
          catalogue rather than only what somebody has filled in. */}
      <label
        htmlFor="show-empty-rows"
        title="Показники, за якими немає жодного запису. Таблиця показує весь перелік, а не лише заповнене."
        className="cursor-pointer text-sm whitespace-nowrap text-muted-foreground select-none"
      >
        Показувати незаповнені ({view.emptyCount})
      </label>
    </div>
  );
}

/**
 * Wraps the table: reports how many empty rows it holds, and hides them.
 *
 * Hiding is CSS on rows that mark themselves with `data-empty`, not a filter, so
 * `RatingTable` stays a server component — the sixty rows are rendered once into
 * HTML instead of being serialised into the page as props and rebuilt in the
 * browser. The subtotals are unaffected either way: an empty row scores nothing,
 * so nothing that is hidden was ever counted.
 */
export function EmptyRowsScope({
  count,
  /** Part of the flex chain that lets the table take the height that is left. */
  fill = false,
  children,
}: {
  count: number;
  fill?: boolean;
  children: React.ReactNode;
}) {
  const view = React.useContext(Ctx);
  const setEmptyCount = view?.setEmptyCount;

  React.useEffect(() => {
    setEmptyCount?.(count);
    // Back to zero when this table leaves the screen, or the switch would keep
    // advertising a count for a tab that is no longer open.
    return () => setEmptyCount?.(0);
  }, [count, setEmptyCount]);

  return (
    <div
      className={cn(
        // Spelled out literally rather than built by interpolation — Tailwind
        // generates only the class strings it can SEE in a source file
        // (docs/aurora.md §12).
        view && !view.showEmpty && '[&_tr[data-empty=true]]:hidden',
        fill && 'flex min-h-0 flex-1 flex-col'
      )}
    >
      {children}
    </div>
  );
}

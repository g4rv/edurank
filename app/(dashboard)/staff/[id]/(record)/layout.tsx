import { Suspense } from 'react';
import { RecordHeader } from '@/components/staff/profile/record-header';
import { RecordHeaderSkeleton } from '@/components/staff/profile/profile-skeleton';
import { RatingViewProvider } from '@/components/rating/rating-view';

/**
 * Everything about one person that does NOT change when you switch tabs.
 *
 * In a `(record)` route group so that `edit` — its sibling, one level up — is
 * NOT wrapped by it. A route group changes no URL. Editing is not a fourth view
 * of a person, it is a task you leave the record to perform, and rendering the
 * identity band above a form suggests you could wander off to «Рейтинг» mid-edit
 * and come back to your changes, which is not true.
 *
 * ## What is here, and what is deliberately NOT
 *
 * The breadcrumb and the identity band. **The tab row is not** — it is rendered
 * by each tab's own page, together with that tab's controls, because the two
 * belong on one line and a page cannot hand anything up to its layout.
 *
 * Two mechanisms that could have crossed that boundary were built and removed:
 *
 * 1. **A client portal.** The page rendered the controls hidden and JavaScript
 *    moved them into the row after hydration. On a hard reload the move failed
 *    outright — the row stayed empty until you switched tabs and back.
 * 2. **A `@toolbar` parallel route.** Server-rendered and correct once settled,
 *    but on every initial load the tab BODY was streamed into the slot's
 *    position for a frame: the row grew to 547px and the tab bar sat centred
 *    beside a column of cards. Moving the slot out of the row did not help —
 *    the body followed it — so it was the slot, not the container.
 *
 * The row moved into the pages instead. It costs the row being re-rendered per
 * tab, which costs nothing visible: `StaffTabs` takes its id from the pathname,
 * so each tab's `loading.tsx` renders the identical bar and React sees the same
 * element across the swap.
 *
 * ## This layout fetches almost nothing, and that is the point
 *
 * It used to `await` the record, the account and the editor's permissions. A
 * layout that suspends holds back everything beneath it, so each tab's own
 * `loading.tsx` could never render and Next fell back to the boundary above —
 * which cannot know which tab is opening, and drew the Профіль's cards over the
 * Характеристика's table.
 *
 * `RecordHeader` is its own async component behind its own `Suspense`, so it
 * suspends alone and the tab arrives when its own data does.
 *
 * ## It is still not a guard
 *
 * A layout does not re-render on navigation, so `auth()` here could not protect
 * the tabs even when it was here. Every page keeps its own check.
 */
export default async function StaffRecordLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    // The provider wraps the tab row AND the tab body: the «незаповнені» switch
    // and the rows it hides are both inside `children` now, but the provider
    // stays here so it survives a tab switch.
    //
    // `h-full` + a flex column, so a tab whose content is one scrolling card can
    // take the height that is left instead of guessing at it. `main` in the
    // dashboard shell is already bounded (`h-screen`); this is the link that was
    // missing between it and the card.
    <RatingViewProvider>
      <div className="flex h-full min-h-0 flex-col space-y-5">
        <Suspense fallback={<RecordHeaderSkeleton />}>
          <RecordHeader id={id} />
        </Suspense>

        {children}
      </div>
    </RatingViewProvider>
  );
}

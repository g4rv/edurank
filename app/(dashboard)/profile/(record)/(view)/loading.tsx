import { ProfileTabRowSkeleton } from '@/components/staff/profile/profile-tab-row';
import { ProfileBodySkeleton } from '@/components/staff/profile/profile-skeleton';

/**
 * «Мій профіль» — the cards tab.
 *
 * **In a `(view)` route group, and that is load-bearing** (owner, 2026-09-09).
 * A `loading.tsx` covers its own segment AND everything beneath it — so while
 * this sat directly in `profile/` it was also the boundary for `/profile/edit`,
 * and opening the edit form drew the profile's cards over a page that is a form.
 *
 * The third time this trap has been sprung: `staff/loading.tsx` did it over
 * `staff/[id]`, `(record)/loading.tsx` did it over the two table tabs. Same
 * one-folder fix each time, and a route group changes no URL.
 *
 * The breadcrumb and the band are the layout's `Suspense` fallback, not this
 * file's — repeating them here is what once drew two headers on top of another.
 */
export default function ProfileViewLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <ProfileTabRowSkeleton />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <ProfileBodySkeleton />
      </div>
    </div>
  );
}

import {
  BreadcrumbSkeleton,
  IdentityBandSkeleton,
  ProfileBodySkeleton,
} from '@/components/staff/profile/profile-skeleton';

/**
 * «Мій профіль» — the same cards as a staff record, so the same body skeleton.
 *
 * Two differences from `/staff/[id]`, both from the route rather than the
 * component: there is no tab bar (Рейтинг and Характеристика are sidebar items
 * for an НПП, not siblings of this page), and the band carries one
 * «Редагувати» rather than edit beside archive. The page is `space-y-5` with no
 * `h-full`, because nothing here has to fill the screen.
 */
export default function ProfileLoading() {
  return (
    <div className="space-y-5">
      <BreadcrumbSkeleton />
      <IdentityBandSkeleton actions={1} />
      <ProfileBodySkeleton />
    </div>
  );
}

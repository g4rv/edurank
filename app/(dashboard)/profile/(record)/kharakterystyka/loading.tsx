import { ProfileTabRowSkeleton } from '@/components/staff/profile/profile-tab-row';
import { KharakterystykaTable } from '@/components/kharakterystyka/kharakterystyka-table';

/** «Характеристика» — the four column headings printed, the rows shimmering. */
export default function MyKharakterystykaLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <ProfileTabRowSkeleton toolbar="kharakterystyka" />
      <KharakterystykaTable.Shell />
    </div>
  );
}

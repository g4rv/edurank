import { RecordTabRowSkeleton } from '@/components/staff/profile/record-tab-row';
import { KharakterystykaTable } from '@/components/kharakterystyka/kharakterystyka-table';

/**
 * The Характеристика tab.
 *
 * The four column headings and the export's label are printed; «9 з 20» and the
 * verdict are the only things on the row that depend on the record.
 */
export default function StaffKharakterystykaLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <RecordTabRowSkeleton toolbar="kharakterystyka" />
      <KharakterystykaTable.Shell />
    </div>
  );
}

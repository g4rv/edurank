import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getKharakterystyka, licencePositionSources } from '@/lib/queries/get-kharakterystyka';
import { NPP_RATING_OPEN } from '@/lib/rating/npp-access';
import { EmptyState } from '@/components/aurora/ui/card';
import {
  KharakterystykaTable,
  KharakterystykaSummary,
} from '@/components/kharakterystyka/kharakterystyka-table';
import { ProfileTabRow } from '@/components/staff/profile/profile-tab-row';
import { ToolbarGroup, ToolbarDivider } from '@/components/staff/record-toolbar';
import { DownloadButton } from '@/components/ui/download-button';

/**
 * «Характеристика» — your own п.38 document, as a tab of your own record.
 *
 * **Moved here from `/achievements/kharakterystyka` on 2026-09-09**, with the
 * rating beside it, so that your record has the same three tabs somebody else's
 * does. The old URL redirects.
 *
 * The «Рівень наукової та професійної активності за 2022–2026 рр.» sentence that
 * used to sit under a heading here is gone: the summary on the tab row already
 * carries the window, and the heading it explained is now a tab.
 */
export default async function MyKharakterystykaPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  // **Being an НПП is what grants this, not the USER role** (2026-08-17). A
  // проректор who teaches, or a division editor who teaches, is ordinary here.
  if (!staffId) redirect('/profile');
  const staff = await getStaff(staffId, true);
  if (!staff?.isNpp) redirect('/profile');

  if (!NPP_RATING_OPEN) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <ProfileTabRow isNpp />
        <EmptyState>Характеристика тимчасово недоступна — рік готується.</EmptyState>
      </div>
    );
  }

  const template = await getActiveTemplate();
  if (!template) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <ProfileTabRow isNpp />
        <EmptyState>Рейтинговий рік ще не налаштовано. Зверніться до адміністратора.</EmptyState>
      </div>
    );
  }

  const [data, positionSources] = await Promise.all([
    getKharakterystyka(staffId, template.year),
    licencePositionSources(template.year),
  ]);
  if (!data) redirect('/profile');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <ProfileTabRow isNpp>
        <ToolbarGroup>
          <KharakterystykaSummary data={data} />
          <ToolbarDivider />
          <DownloadButton
            href={`/api/export/kharakterystyka?year=${template.year}&staffId=${staffId}`}
            label="Вивантажити Excel"
            title="Характеристика_РНПАВ у форматі документа"
            variant="ghost"
          />
        </ToolbarGroup>
      </ProfileTabRow>

      <KharakterystykaTable data={data} sources={Object.fromEntries(positionSources)} fill />
    </div>
  );
}

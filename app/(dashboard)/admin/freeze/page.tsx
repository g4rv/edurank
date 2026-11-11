import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { loadFreezeSettings } from '@/lib/freeze/state';
import {
  listFreezeExemptionCandidates,
  listFreezeExemptions,
} from '@/lib/queries/list-freeze-exemptions';
import { FreezeSettingsForm } from '@/components/admin/freeze-settings-form';
import { FreezeExemptions } from '@/components/admin/freeze-exemptions';

/**
 * «Заморозка» (owner, 2026-11-11): the four switches and the whitelist, in
 * place of three constants and a redeploy. ADMIN only — the one role the
 * switches never apply to.
 */
export default async function FreezePage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const [settings, listed, candidates] = await Promise.all([
    loadFreezeSettings(),
    listFreezeExemptions(),
    listFreezeExemptionCandidates(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Заморозка</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-foreground-soft">
          Тимчасово закриває характеристику, пов’язані показники рейтингу або профіль для змін. Усе
          лишається доступним для перегляду.
        </p>
      </div>

      <FreezeSettingsForm initial={settings} />
      <FreezeExemptions listed={listed} candidates={candidates} />
    </div>
  );
}

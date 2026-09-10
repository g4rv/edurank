import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listMyClaims } from '@/lib/queries/list-student-claims';
import { getSpecialityOwnerNames } from '@/lib/queries/get-speciality-departments';
import { registerRows } from '@/lib/queries/list-admitted-students';
import { registerOptions } from '@/lib/students/accepted';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { EmptyState } from '@/components/aurora/ui/card';
import { MyClaims } from '@/components/stake/my-claims';
import { StudentsHeader } from '@/components/stake/students-header';

/**
 * «Мої залучені здобувачі» — the НПП's own list.
 *
 * They see every claim with what it would add and the total, including claims
 * a colleague has secretly made too. They are NOT told about conflicts: the
 * duplicate is shown only on the review screen, where ADMIN rules on it.
 * So the total says «можливе», not «earned».
 *
 * **Its own page, not a tab of «Мій профіль»** (owner, 2026-09-10). The
 * record's three tabs are documents ABOUT a person — Профіль, Рейтинг,
 * Характеристика — and this is data entry, the same reason
 * `/achievements/[section]` was left out of the record too. It keeps its
 * sidebar entry and takes the breadcrumb its neighbour «Мій профіль» has.
 */
export default async function MyStudentsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  // **Being an НПП is what grants this, not the USER role** (2026-08-17). These
  // are a person's own record, and the role decides what somebody may do to
  // OTHER people — not whether they can see their own rating. A проректор who
  // teaches, or a division editor who teaches, is ordinary here; `create-admin`
  // already says «flip isNpp on their profile later if the person is also an
  // НПП», and the pages used to bounce exactly that person.
  if (!staffId) redirect('/profile');

  const staff = await getStaff(staffId, true);
  if (!staff?.isNpp) redirect('/profile');

  const template = await getActiveTemplate();
  if (!template) {
    return (
      <div className="type-comfortable space-y-5">
        <Breadcrumbs items={[{ label: 'Особисте' }, { label: 'Мої здобувачі' }]} />
        <StudentsHeader />
        <EmptyState>Рейтинговий рік ще не налаштовано. Зверніться до адміністратора.</EmptyState>
      </div>
    );
  }

  const { claims, potential, potentialCount, confirmed, confirmedCount } = await listMyClaims(
    staffId,
    template.year
  );
  // The picker's tree, not the register itself — a few KB against a thousand names.
  const [rows, ownerNames] = await Promise.all([
    registerRows(template.year),
    getSpecialityOwnerNames(),
  ]);
  const register = registerOptions(rows, ownerNames);

  // An empty register closes the FORM and nothing else.
  //
  // It used to return early here, which hid the person's own claims, their
  // total and their «підтверджено» count behind the notice — on the one screen
  // where somebody checks work they have already done. Between a deploy and the
  // year's import that is every НПП seeing their students apparently gone.
  //
  // The form still has to go: an empty picker is a dead end nobody can
  // diagnose, the same reason the cascade never offers a combination with
  // nobody behind it. Only an ADMIN can fix it, so the notice says so.
  const registerReady = rows.length > 0;
  const yearOpen = template.status === 'OPEN';

  // **The reason takes the form's place** (2026-09-10). Both of these were
  // banners across the top of the page — one amber, which §3 forbids as chrome
  // — announcing a problem above a list that works perfectly well. The only
  // thing either one stops is adding, so each is said in the card where the
  // form would have been.
  const addBlockedReason = !registerReady
    ? `Здобувачів за ${template.year} рік ще не імпортовано. Ваші наявні заявки збережено — зверніться до адміністратора.`
    : !yearOpen
      ? 'Рік закрито, додавати вже не можна.'
      : undefined;

  return (
    // `h-full` + a flex column, so the claims table can take the height that is
    // left instead of guessing at it. `main` in the dashboard shell is already
    // bounded (`h-screen`); this is the link between it and the card, the same
    // chain the record tabs use for the rating and Характеристика tables.
    <div className="type-comfortable flex h-full min-h-0 flex-col gap-5">
      <Breadcrumbs items={[{ label: 'Особисте' }, { label: 'Мої здобувачі' }]} />
      <StudentsHeader year={template.year} />

      <MyClaims
        claims={claims}
        potential={potential}
        potentialCount={potentialCount}
        confirmed={confirmed}
        confirmedCount={confirmedCount}
        register={register}
        year={template.year}
        canAdd={yearOpen && registerReady}
        addBlockedReason={addBlockedReason}
      />
    </div>
  );
}

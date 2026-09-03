import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listMyClaims } from '@/lib/queries/list-student-claims';
import { getSpecialityOwnerNames } from '@/lib/queries/get-speciality-departments';
import { registerRows } from '@/lib/queries/list-admitted-students';
import { registerOptions } from '@/lib/students/accepted';
import { AnimatedPage } from '@/components/ui/animated-page';
import { MyClaims } from '@/components/stake/my-claims';

/**
 * «Мої залучені здобувачі» — the НПП's own list.
 *
 * They see every claim with what it would add and the total, including claims
 * a colleague has secretly made too. They are NOT told about conflicts: the
 * duplicate is shown only on the review screen, where ADMIN rules on it.
 * So the total says «можливе», not «earned».
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
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Мої залучені здобувачі</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано. Зверніться до адміністратора.
        </div>
      </AnimatedPage>
    );
  }

  const { claims, potential, confirmed } = await listMyClaims(staffId, template.year);
  // The picker's tree, not the register itself — a few KB against a thousand names.
  const [rows, ownerNames] = await Promise.all([
    registerRows(template.year),
    getSpecialityOwnerNames(),
  ]);
  const register = registerOptions(rows, ownerNames);

  // An empty picker is a dead end the person cannot diagnose — the same reason
  // the cascade never offers a combination with nobody behind it. Nobody has
  // imported this year's наказ yet, and only an ADMIN can.
  if (rows.length === 0) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Мої залучені здобувачі</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Здобувачів за {template.year} рік ще не імпортовано. Зверніться до адміністратора.
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Мої залучені здобувачі</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
          Вступники {template.year} року, яких ви залучили. Обирати можна з-поміж усіх зарахованих
          до університету — не лише тих, хто вступив на спеціальності вашої кафедри.
          {template.status !== 'OPEN' && ' Рік закрито, додавати вже не можна.'}
        </p>
      </div>

      <MyClaims
        claims={claims}
        potential={potential}
        confirmed={confirmed}
        register={register}
        year={template.year}
        canAdd={template.status === 'OPEN'}
      />
    </AnimatedPage>
  );
}

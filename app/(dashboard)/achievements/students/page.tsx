import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listMyClaims } from '@/lib/queries/list-student-claims';
import { registerOptions } from '@/lib/students/accepted';
import { AnimatedPage } from '@/components/ui/animated-page';
import { MyClaims } from '@/components/stake/my-claims';

/**
 * «Мої залучені здобувачі» — the НПП's own list.
 *
 * They see every claim with what it would add and the total, including claims
 * a colleague has secretly made too. They are NOT told about conflicts: the
 * duplicate is shown only to the завідувач, who is the one who can judge it.
 * So the total says «можливе», not «earned».
 */
export default async function MyStudentsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  if (!staffId || session.user.role !== 'USER') redirect('/profile');

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
  // The picker's tree, not the register itself — a few KB against ~130.
  const register = registerOptions();

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

import Link from 'next/link';
import { auth } from '@/lib/auth';
import { listStaff, type StaffListItem } from '@/lib/queries/list-staff';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AcademicRank, ScientificDegree } from '@/lib/generated/prisma/client';

const ACADEMIC_RANK_LABELS: Record<AcademicRank, string> = {
  LECTURER: 'Викладач',
  SENIOR_LECTURER: 'Старший викладач',
  DOCENT: 'Доцент',
  PROFESSOR: 'Професор',
};

const SCIENTIFIC_DEGREE_LABELS: Record<ScientificDegree, string> = {
  CANDIDATE: 'Кандидат наук',
  DOCTOR: 'Доктор наук',
};

const TABS = [
  { label: 'Всі', value: undefined },
  { label: 'НПП', value: 'npp' },
  { label: 'Адміністративний', value: 'admin' },
] as const;

function fullName(s: Pick<StaffListItem, 'lastName' | 'firstName' | 'patronymic'>) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { type } = await searchParams;
  const [session, staff] = await Promise.all([auth(), listStaff({ type })]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Персонал</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{staff.length} записів</p>
        </div>
        {session?.user.role === 'ADMIN' && (
          <Button asChild>
            <Link href="/staff/new">Додати</Link>
          </Button>
        )}
      </div>

      <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {TABS.map((tab) => {
          const isActive = type === tab.value || (!type && tab.value === undefined);
          const href = tab.value ? `/staff?type=${tab.value}` : '/staff';
          return (
            <Link
              key={tab.label}
              href={href}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {staff.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Записів не знайдено
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ПІБ</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Тип</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Кафедра / Відділ
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Вчене звання
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr
                  key={member.id}
                  className="border-b transition-colors last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/staff/${member.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {fullName(member)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        member.isNpp
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {member.isNpp ? 'НПП' : 'Адм.'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {member.department?.name ?? member.division?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {member.academicRank
                      ? [
                          ACADEMIC_RANK_LABELS[member.academicRank],
                          member.scientificDegree
                            ? SCIENTIFIC_DEGREE_LABELS[member.scientificDegree]
                            : null,
                        ]
                          .filter(Boolean)
                          .join(', ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

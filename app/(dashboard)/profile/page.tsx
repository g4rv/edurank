import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ExternalLink, Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff, type StaffDetail } from '@/lib/queries/get-staff';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getRatingEntry } from '@/lib/queries/get-rating';
import { SECTION_TITLES } from '@/lib/rating/activity-types';
import { AnimatedPage } from '@/components/ui/animated-page';
import { Button } from '@/components/ui/button';
import { ACADEMIC_RANK_LABELS, SCIENTIFIC_DEGREE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

function fullName(s: Pick<StaffDetail, 'lastName' | 'firstName' | 'patronymic'>) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-foreground uppercase">
        {title}
      </h2>
      <dl className="space-y-3">{children}</dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function PositionEntry({
  badge,
  faculty,
  department,
}: {
  badge: string;
  faculty?: string | null;
  department: string;
}) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <span className="text-xs font-medium text-muted-foreground">{badge}</span>
      {faculty && <p className="mt-0.5 text-xs text-muted-foreground">{faculty}</p>}
      <p className="mt-0.5 text-sm">{department}</p>
    </div>
  );
}

function ProfileLink({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count?: number | null;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-3 text-sm">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
        >
          Профіль
          <ExternalLink className="size-3" />
        </a>
        {count !== null && count !== undefined && (
          <span className="text-muted-foreground">{count} цитувань</span>
        )}
      </dd>
    </div>
  );
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  const canAccessStaffList = session.user.role !== 'USER';

  if (!staffId) {
    return (
      <AnimatedPage className="space-y-6">
        {canAccessStaffList && (
          <Link
            href="/staff"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Персонал
          </Link>
        )}

        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Ваш профіль не знайдено. Зверніться до адміністратора.
        </div>
      </AnimatedPage>
    );
  }

  const staff = await getStaff(staffId, true);
  if (!staff) notFound();

  // Compact rating summary (M6) — the full table lives on «Мій рейтинг»
  const template = staff.isNpp ? await getActiveTemplate() : null;
  const rating = template ? await getRatingEntry(staffId, template.year) : null;

  const subtitle =
    staff.isNpp && staff.academicRank
      ? [
          ACADEMIC_RANK_LABELS[staff.academicRank],
          staff.scientificDegree ? SCIENTIFIC_DEGREE_LABELS[staff.scientificDegree] : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  return (
    <AnimatedPage className="space-y-6">
      {canAccessStaffList && (
        <Link
          href="/staff"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Персонал
        </Link>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{fullName(staff)}</h1>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                staff.isNpp ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}
            >
              {staff.isNpp ? 'НПП' : 'Адміністративний'}
            </span>
          </div>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>

        {/* Everyone can correct their own record; how much of it depends on the
            role. ADMIN and EDITOR already have the full staff form and their
            permissions are applied there, so they go to it. Everyone else gets
            the narrow one: contact details and research profile links. */}
        <Button asChild variant="outline">
          <Link href={canAccessStaffList ? `/staff/${staffId}/edit` : '/profile/edit'}>
            <Pencil className="size-4" />
            Редагувати
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {template && (
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
                Рейтинг — {template.year} рік
              </h2>
              <Link
                href="/achievements"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Мій рейтинг
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[1, 2, 3, 4, 5].map((n) => {
                const score = rating
                  ? [
                      rating.section1Score,
                      rating.section2Score,
                      rating.section3Score,
                      rating.section4Score,
                      rating.section5Score,
                    ][n - 1]
                  : 0;
                return (
                  <div key={n} className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground" title={SECTION_TITLES[n]}>
                      Розділ {n}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">{score}</p>
                  </div>
                );
              })}
              <div className="rounded-lg bg-primary/10 px-3 py-2">
                <p className="text-xs text-primary">Разом</p>
                <p className="text-lg font-bold tabular-nums">{rating?.totalScore ?? 0}</p>
              </div>
            </div>
          </div>
        )}

        <InfoCard title="Контакти">
          <Field label="Email" value={staff.email} />
          <Field label="Телефон" value={staff.phone ?? '—'} />
          {staff.division && <Field label="Відділ" value={staff.division.name} />}
          <Field
            label="Ставка"
            value={staff.employmentRate !== null ? `${staff.employmentRate}` : '—'}
          />
        </InfoCard>

        {staff.isNpp && (
          <InfoCard title="Академічна інформація">
            <Field
              label="Вчене звання"
              value={staff.academicRank ? ACADEMIC_RANK_LABELS[staff.academicRank] : '—'}
            />
            <Field
              label="Науковий ступінь"
              value={
                staff.scientificDegree ? SCIENTIFIC_DEGREE_LABELS[staff.scientificDegree] : '—'
              }
            />
            <Field
              label="Педагогічний досвід"
              value={
                staff.pedagogicalExperience !== null ? `${staff.pedagogicalExperience} років` : '—'
              }
            />
            <Field
              label="Ступінь відповідає кафедрі"
              value={
                staff.degreeMatchesDepartment === null
                  ? '—'
                  : staff.degreeMatchesDepartment
                    ? 'Так'
                    : 'Ні'
              }
            />
          </InfoCard>
        )}

        {staff.isNpp && (
          <InfoCard title="Наукові профілі">
            {staff.wosUrl ? (
              <ProfileLink
                label="Web of Science"
                href={staff.wosUrl}
                count={staff.wosCitationCount}
              />
            ) : (
              <Field label="Web of Science" value="—" />
            )}
            {staff.scopusUrl ? (
              <ProfileLink
                label="Scopus"
                href={staff.scopusUrl}
                count={staff.scopusCitationCount}
              />
            ) : (
              <Field label="Scopus" value="—" />
            )}
            {staff.googleScholarUrl ? (
              <ProfileLink
                label="Google Scholar"
                href={staff.googleScholarUrl}
                count={staff.googleScholarCitationCount}
              />
            ) : (
              <Field label="Google Scholar" value="—" />
            )}
            <Field label="ORCID" value={staff.orcidId ?? '—'} />
          </InfoCard>
        )}

        {(staff.headOfDepartment || staff.deanOfFaculty) && (
          <InfoCard title="Керівні посади">
            {staff.headOfDepartment && (
              <Field label="Завідувач кафедри" value={staff.headOfDepartment.name} />
            )}
            {staff.deanOfFaculty && (
              <Field label="Декан факультету" value={staff.deanOfFaculty.name} />
            )}
          </InfoCard>
        )}

        {(staff.department || staff.partTimeDepartments.length > 0) && (
          <InfoCard title="Місця роботи">
            <div className="divide-y">
              {staff.department && (
                <PositionEntry
                  badge="Основне"
                  faculty={staff.department.faculty?.name}
                  department={staff.department.name}
                />
              )}
              {staff.partTimeDepartments.map((pd) => (
                <PositionEntry
                  key={pd.department.id}
                  badge="Сумісництво"
                  faculty={pd.department.faculty?.name}
                  department={pd.department.name}
                />
              ))}
            </div>
          </InfoCard>
        )}
      </div>
    </AnimatedPage>
  );
}

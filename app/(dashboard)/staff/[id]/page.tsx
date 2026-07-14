import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff, type StaffDetail } from '@/lib/queries/get-staff';
import { getStaffAccount } from '@/lib/queries/get-staff-account';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { AccountCard } from '@/components/staff/account-card';
import { StaffTabs } from '@/components/staff/staff-tabs';
import { Button } from '@/components/ui/button';
import { AnimatedPage } from '@/components/ui/animated-page';
import { DeleteStaffButton } from '@/components/staff/delete-button';
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

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const role = session?.user.role;
  if (role === 'USER') redirect('/profile');

  const isAdmin = role === 'ADMIN';
  const isEditor = role === 'EDITOR';
  const showConfidential = isAdmin || session?.user.staffId === id;

  const staff = await getStaff(id, showConfidential);

  if (!staff) notFound();

  const account = isAdmin ? await getStaffAccount(id) : null;

  let canEdit = isAdmin;
  let canDelete = isAdmin;
  if (isEditor) {
    const perms = await getEditorEntityPermissions(session?.user.staffId ?? '', 'STAFF');
    canEdit = perms.canUpdate;
    canDelete = perms.canDelete;
  }

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
      <Link
        href="/staff"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Персонал
      </Link>

      <div className="flex items-start justify-between">
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
        {(canEdit || canDelete) && (
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/staff/${id}/edit`}>Редагувати</Link>
              </Button>
            )}
            {canDelete && <DeleteStaffButton staffId={id} staffName={fullName(staff)} />}
          </div>
        )}
      </div>

      <StaffTabs staffId={id} active="profile" showRating={staff.isNpp} />

      <div className="flex items-start gap-4">
        {/* Left — general info */}
        <div className="flex flex-1 flex-col gap-4">
          <InfoCard title="Контакти">
            <Field label="Email" value={staff.email} />
            <Field label="Телефон" value={staff.phone ?? '—'} />
            {staff.division && <Field label="Відділ" value={staff.division.name} />}
            {showConfidential && (
              <Field
                label="Ставка"
                value={staff.employmentRate != null ? `${staff.employmentRate}` : '—'}
              />
            )}
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
                  staff.pedagogicalExperience !== null
                    ? `${staff.pedagogicalExperience} років`
                    : '—'
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
        </div>

        {/* Right — account, roles and work places */}
        <div className="flex flex-1 flex-col gap-4">
          {account && (
            <AccountCard staffId={id} account={account} isSelf={session?.user.id === id} />
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
      </div>
    </AnimatedPage>
  );
}

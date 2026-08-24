import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff, type StaffDetail } from '@/lib/queries/get-staff';
import { getStakeBreakdown } from '@/lib/queries/get-stake-breakdown';
import { getStaffAccount } from '@/lib/queries/get-staff-account';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { canMutateStaffRecord } from '@/lib/permissions';
import { AccountCard } from '@/components/staff/account-card';
import { StaffTabs } from '@/components/staff/staff-tabs';
import { Button } from '@/components/ui/button';
import { AnimatedPage } from '@/components/ui/animated-page';
import { ArchiveStaffButton, RestoreStaffButton } from '@/components/staff/archive-button';
import { ACADEMIC_RANK_LABELS, SCIENTIFIC_DEGREE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { formatStake } from '@/lib/stake/units';

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
  if (!session) redirect('/login');

  const role = session.user.role;
  if (role === 'USER') redirect('/profile');

  const isAdmin = role === 'ADMIN';
  const isEditor = role === 'EDITOR';
  const showConfidential = isAdmin || session.user.staffId === id;

  const staff = await getStaff(id, showConfidential);
  const stakeParts = showConfidential ? await getStakeBreakdown(id) : [];

  if (!staff) notFound();

  const account = isAdmin ? await getStaffAccount(id) : null;

  let canEdit = isAdmin;
  let canArchive = isAdmin;
  if (isEditor) {
    const perms = await getEditorEntityPermissions(session.user.staffId ?? '', 'STAFF');
    // The entity permission says an editor may edit staff; canMutateStaffRecord
    // says WHOSE — USER records and their own, never an admin's. Both actions
    // re-check it, so showing the button on an admin's record only walked the
    // editor into «Недостатньо прав» after filling in the whole form.
    const target = { id: staff.id, role: staff.role };
    canEdit = perms.canUpdate && canMutateStaffRecord(session.user, target);
    // STAFF DELETE is the right to take someone off the roster; archiving is
    // now the only thing that does, so it governs that.
    canArchive =
      perms.canDelete && canMutateStaffRecord(session.user, target, { allowSelf: false });
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
            {staff.archivedAt && (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Архівований
              </span>
            )}
          </div>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          {staff.archivedAt && (
            <p className="mt-1 text-sm text-muted-foreground">
              Не враховується в рейтингу поточного року, вхід у систему вимкнено
              {staff.archiveReason ? ` — ${staff.archiveReason}` : ''}
            </p>
          )}
        </div>
        {(canEdit || canArchive) && (
          <div className="flex items-center gap-2">
            {/* An archived record is read-only until it is restored — editing
                someone who is off the roster only invites confusion about why
                their changes do not show up in the rating. */}
            {canEdit && !staff.archivedAt && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/staff/${id}/edit`}>Редагувати</Link>
              </Button>
            )}
            {canArchive &&
              (staff.archivedAt ? (
                <RestoreStaffButton staffId={id} staffName={fullName(staff)} />
              ) : (
                <ArchiveStaffButton staffId={id} staffName={fullName(staff)} />
              ))}
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
                value={
                  <>
                    {/* The SUM of what each кафедра allocated — the same rows the
                        note below breaks down, so the two can never disagree.
                        `Staff.employmentRate` holds this too, but as a cache that
                        lists and exports read: it was NULL for everybody spread
                        before commit d0f92e8, and `liftStoredAllocations` still
                        does not refresh it when a cap moves a saved split. Reading
                        the allocations here means the profile is right whatever
                        state the column is in (2026-08-24). */}
                    {stakeParts.length > 0
                      ? formatStake(stakeParts.reduce((sum, part) => sum + part.hundredths, 0))
                      : '—'}
                    {/* `employmentRate` is not a hand-typed contract rate: the
                        distribution writes it, and since 2026-08-24 it is the SUM
                        across every кафедра that pays this person. This says which
                        кафедри those are, read from the same allocations the sum
                        came from — so the parts always add up to the whole.

                        Nothing renders until a head has filled a grid: a кафедра
                        nobody has spread yet is not a кафедра paying 0,00. */}
                    {stakeParts.length > 0 && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Розподілено:{' '}
                        {stakeParts
                          .map((part) => `${part.department} — ${formatStake(part.hundredths)}`)
                          .join(' + ')}
                      </span>
                    )}
                  </>
                }
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
              <Field
                label="Дата захисту дисертації"
                value={
                  // Formatted in UTC, matching how the column is written — a
                  // local-calendar render would show the previous day for any
                  // deployment west of UTC.
                  staff.degreeDefenceDate
                    ? staff.degreeDefenceDate.toLocaleDateString('uk-UA', { timeZone: 'UTC' })
                    : '—'
                }
              />
            </InfoCard>
          )}

          {/* Not gated on isNpp: an administrative employee can hold a doctorate
              and an ORCID too. «Академічна інформація» above stays НПП-only,
              because звання and ступінь really are academic-staff data. */}
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
        </div>

        {/* Right — account, roles and work places */}
        <div className="flex flex-1 flex-col gap-4">
          {account && (
            <AccountCard staffId={id} account={account} isSelf={session.user.id === id} />
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

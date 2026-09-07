import type { StaffDetail } from '@/lib/queries/get-staff';
import {
  ACADEMIC_RANK_LABELS,
  SCIENTIFIC_DEGREE_LABELS,
  ADMIN_POSITION_LABELS,
} from '@/lib/labels';
import { formatStake } from '@/lib/stake/units';
import { OrcidField } from '@/components/profile/orcid-field';
import { InfoCard, Field, MaybeField, PositionEntry, ProfileLink } from './primitives';

/**
 * The detail cards, one component per section.
 *
 * Two rules run through all of them:
 *
 * 1. **A blank row is not rendered.** What is missing is collected by
 *    `missingProfileFields` and named once at the foot of the page, so the
 *    values that DO exist are not buried in dashes. `showEmpty` overrides this
 *    for the mock page, where the point is to see the whole vocabulary at once.
 * 2. **No card decides a permission.** `EmploymentCard` is handed `showStake`; it
 *    never works out whether this reader may see a ставка. That stays in the
 *    route, where the session is, and this file has nothing to leak.
 */

export interface StakePart {
  department: string;
  hundredths: number;
}

interface CardProps {
  staff: StaffDetail;
  showEmpty?: boolean;
}

/**
 * The ставка, and how it is split.
 *
 * Was «Зайнятість», holding відділ and ставка. The відділ has moved to «Місця
 * роботи» — it IS a place of work, and having two cards each holding half of
 * «where does this person sit» helped nobody (owner, 2026-09-07). What is left
 * is one number, so the card says so and shows it as a figure rather than as a
 * label/value pair repeating its own title.
 *
 * Renders nothing when the reader may not see a ставка, which is most readers.
 */
export function StakeCard({
  stakeParts,
  showStake,
}: {
  stakeParts: StakePart[];
  /** Decided by the route, never here. ADMIN, or the person themselves. */
  showStake: boolean;
}) {
  if (!showStake) return null;

  const total = stakeParts.reduce((sum, p) => sum + p.hundredths, 0);

  return (
    <InfoCard title="Ставка">
      <div>
        {/* The SUM of what each кафедра allocated, read from the same rows the
            note below breaks down, so the two can never disagree.
            `Staff.employmentRate` caches this but has been stale — it was NULL
            for everybody spread before d0f92e8, and `liftStoredAllocations`
            still does not refresh it when a cap moves a saved split
            (2026-08-24). */}
        <p className="text-2xl font-semibold tabular-nums">
          {stakeParts.length > 0 ? formatStake(total) : '—'}
        </p>
        {/* Which кафедри those are, from the same allocations the sum came from,
            so the parts always add up to the whole. Nothing renders until a head
            has filled a grid: a кафедра nobody has spread yet is not a кафедра
            paying 0,00. */}
        {stakeParts.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {stakeParts.map((p) => `${p.department} — ${formatStake(p.hundredths)}`).join(' + ')}
          </p>
        )}
      </div>
    </InfoCard>
  );
}

/** НПП only — звання and ступінь really are academic-staff data. */
export function AcademicCard({ staff, showEmpty = false }: CardProps) {
  if (!staff.isNpp) return null;

  return (
    <InfoCard title="Академічна інформація" columns={2}>
      <MaybeField
        label="Вчене звання"
        value={staff.academicRank ? ACADEMIC_RANK_LABELS[staff.academicRank] : null}
        showEmpty={showEmpty}
      />
      <MaybeField
        label="Науковий ступінь"
        value={staff.scientificDegree ? SCIENTIFIC_DEGREE_LABELS[staff.scientificDegree] : null}
        showEmpty={showEmpty}
      />
      <MaybeField
        label="Педагогічний стаж"
        value={staff.pedagogicalExperience !== null ? `${staff.pedagogicalExperience} років` : null}
        showEmpty={showEmpty}
      />
      <MaybeField
        label="Дата захисту дисертації"
        value={
          // Formatted in UTC, matching how the column is written — a
          // local-calendar render would show the previous day for any
          // deployment west of UTC.
          staff.degreeDefenceDate
            ? staff.degreeDefenceDate.toLocaleDateString('uk-UA', { timeZone: 'UTC' })
            : null
        }
        showEmpty={showEmpty}
      />
      <MaybeField
        label="Ступінь відповідає кафедрі"
        value={
          staff.degreeMatchesDepartment === null
            ? null
            : staff.degreeMatchesDepartment
              ? 'Так'
              : 'Ні'
        }
        showEmpty={showEmpty}
      />
      {/* Neither old page showed these two, though both feed the rating through
          PROFILE_DERIVED indicators — so a gap here silently costs points. */}
      <MaybeField
        label="Спеціальність за дипломом"
        value={staff.basicEducationSpecialty}
        showEmpty={showEmpty}
      />
      <MaybeField
        label="Освіта відповідає кафедрі"
        value={staff.basicEducationMatch === null ? null : staff.basicEducationMatch ? 'Так' : 'Ні'}
        showEmpty={showEmpty}
      />
    </InfoCard>
  );
}

/** NOT gated on isNpp: an administrative employee can hold a doctorate and an
 *  ORCID too. */
export function ResearchProfilesCard({ staff, showEmpty = false }: CardProps) {
  const any =
    staff.wosUrl || staff.scopusUrl || staff.googleScholarUrl || staff.orcidId || showEmpty;
  if (!any) return null;

  return (
    <InfoCard title="Наукові профілі">
      {staff.wosUrl ? (
        <ProfileLink label="Web of Science" href={staff.wosUrl} count={staff.wosCitationCount} />
      ) : (
        showEmpty && <Field label="Web of Science" value="—" />
      )}
      {staff.scopusUrl ? (
        <ProfileLink label="Scopus" href={staff.scopusUrl} count={staff.scopusCitationCount} />
      ) : (
        showEmpty && <Field label="Scopus" value="—" />
      )}
      {staff.googleScholarUrl ? (
        <ProfileLink
          label="Google Scholar"
          href={staff.googleScholarUrl}
          count={staff.googleScholarCitationCount}
        />
      ) : (
        showEmpty && <Field label="Google Scholar" value="—" />
      )}
      {(staff.orcidId || showEmpty) && <OrcidField value={staff.orcidId} />}
    </InfoCard>
  );
}

/**
 * Every post this person holds.
 *
 * Headship is derived from `headId`/`deanId`, never from a Role — one person is
 * routinely a завідувач, an НПП and a division editor at once.
 *
 * **`adminPosition` lives here now.** It used to appear only in the identity
 * band, as the fallback where an НПП showed their звання. When that line came
 * out as duplicated (2026-09-07) the duplication argument did not hold for this
 * field: «Академічна інформація» is НПП-only, so an administrative employee's
 * «проректор» had nowhere else to go and would simply have vanished from their
 * profile. A post belongs on the card about posts.
 */
export function LeadershipCard({ staff, showEmpty = false }: CardProps) {
  const none = !staff.headOfDepartment && !staff.deanOfFaculty && !staff.adminPosition;
  if (none && !showEmpty) return null;

  return (
    <InfoCard title="Керівні посади">
      <MaybeField
        label="Адміністративна посада"
        value={staff.adminPosition ? ADMIN_POSITION_LABELS[staff.adminPosition] : null}
        showEmpty={showEmpty}
      />
      <MaybeField
        label="Завідувач кафедри"
        value={staff.headOfDepartment?.name}
        showEmpty={showEmpty}
      />
      <MaybeField
        label="Декан факультету"
        value={staff.deanOfFaculty?.name}
        showEmpty={showEmpty}
      />
    </InfoCard>
  );
}

/**
 * Everywhere this person works — both кафедри, and their відділ.
 *
 * The відділ moved in here from «Зайнятість» (owner, 2026-09-07): it is a place
 * of work like the others, just a cross-cutting one rather than one that sits
 * under a факультет. It is listed last and without a факультет line, because a
 * відділ is university-wide and belongs to none.
 *
 * This is also the only place the affiliation now appears — it used to be
 * duplicated in the identity band, which had room for one кафедра and therefore
 * always misrepresented a сумісник.
 */
export function WorkplacesCard({ staff, showEmpty = false }: CardProps) {
  const none = !staff.department && staff.partTimeDepartments.length === 0 && !staff.division;
  if (none && !showEmpty) return null;

  return (
    <InfoCard title="Місця роботи">
      {none ? (
        <Field label="Кафедра" value="—" />
      ) : (
        <div className="divide-y">
          {staff.department && (
            <PositionEntry
              badge="Основне"
              faculty={staff.department.faculty?.name}
              facultyHref={
                staff.department.faculty ? `/faculties/${staff.department.faculty.id}` : null
              }
              department={staff.department.name}
              departmentHref={`/departments/${staff.department.id}`}
            />
          )}
          {staff.partTimeDepartments.map((pd) => (
            <PositionEntry
              key={pd.department.id}
              badge="Сумісництво"
              faculty={pd.department.faculty?.name}
              facultyHref={pd.department.faculty ? `/faculties/${pd.department.faculty.id}` : null}
              department={pd.department.name}
              departmentHref={`/departments/${pd.department.id}`}
            />
          ))}
          {staff.division && (
            <PositionEntry
              badge="Відділ"
              department={staff.division.name}
              departmentHref={`/divisions/${staff.division.id}`}
            />
          )}
        </div>
      )}
    </InfoCard>
  );
}

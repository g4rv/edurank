import type { StaffDetail } from '@/lib/queries/get-staff';
import {
  ACADEMIC_RANK_LABELS,
  SCIENTIFIC_DEGREE_LABELS,
  ADMIN_POSITION_LABELS,
} from '@/lib/labels';
import { formatStake } from '@/lib/stake/units';
import { OrcidField } from '@/components/profile/orcid-field';
import { Card } from '@/components/aurora/ui/card';
import { Fields, Field, MaybeField, PositionEntry, ProfileLink } from './primitives';

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
  /** Matched against the кафедра on the row — never by name, which is editable */
  departmentId: string;
  department: string;
  hundredths: number;
}

interface CardProps {
  staff: StaffDetail;
  showEmpty?: boolean;
}

/** НПП only — звання and ступінь really are academic-staff data. */
export function AcademicCard({ staff, showEmpty = false }: CardProps) {
  if (!staff.isNpp) return null;

  return (
    <Card title="Академічна інформація">
      <Fields columns={2}>
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
          value={
            staff.pedagogicalExperience !== null ? `${staff.pedagogicalExperience} років` : null
          }
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
          value={
            staff.basicEducationMatch === null ? null : staff.basicEducationMatch ? 'Так' : 'Ні'
          }
          showEmpty={showEmpty}
        />
      </Fields>
    </Card>
  );
}

/** NOT gated on isNpp: an administrative employee can hold a doctorate and an
 *  ORCID too. */
export function ResearchProfilesCard({ staff, showEmpty = false }: CardProps) {
  const any =
    staff.wosUrl || staff.scopusUrl || staff.googleScholarUrl || staff.orcidId || showEmpty;
  if (!any) return null;

  return (
    <Card title="Наукові профілі">
      <Fields>
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
      </Fields>
    </Card>
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
    <Card title="Керівні посади">
      <Fields>
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
      </Fields>
    </Card>
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
/**
 * Where somebody works, and what each of those places pays them.
 *
 * **The ставка lives here now** (owner, 2026-09-07). It had a card of its own,
 * which printed «Кафедра інформатики — 0,25» beside a «Місця роботи» card that
 * had just printed «Кафедра інформатики» — one fact, twice, on one screen. A
 * ставка is per кафедра, so it belongs on the кафедра's row; the total belongs
 * on the heading, where a total reads as the sum of what is under it.
 *
 * **Matched by `departmentId`, never by name.** A кафедра can be renamed on
 * /departments, and matching on the name would silently drop a row's figure the
 * day somebody fixed a typo.
 *
 * The total is the sum of ALL parts, including any for a кафедра the person is
 * no longer on — so the figure stays true even when a row cannot be drawn for
 * it. `showStake` is decided by the route; this card never works it out.
 */
export function WorkplacesCard({
  staff,
  stakeParts = [],
  showStake = false,
  showEmpty = false,
}: CardProps & { stakeParts?: StakePart[]; showStake?: boolean }) {
  const none = !staff.department && staff.partTimeDepartments.length === 0 && !staff.division;
  if (none && !showEmpty) return null;

  const byDepartment = new Map(stakeParts.map((p) => [p.departmentId, p]));
  const total = stakeParts.reduce((sum, p) => sum + p.hundredths, 0);

  /**
   * A кафедра's own share, or nothing at all when the reader may not see it.
   *
   * The bare figure — no «Ставка» caption over it. The heading names the column
   * once, and repeating the word on every row bought a second line per row and
   * nothing else.
   */
  function stake(departmentId: string) {
    if (!showStake) return undefined;
    const part = byDepartment.get(departmentId);

    return part ? (
      <span className="font-medium tabular-nums">{formatStake(part.hundredths)}</span>
    ) : (
      // Not «0,00». A кафедра nobody has spread yet is not a кафедра paying
      // nothing, and the difference is what a завідувач is chasing.
      <span
        className="text-muted-foreground"
        title="Завідувач ще не розподілив ставки цієї кафедри"
      >
        —
      </span>
    );
  }

  return (
    <Card
      title="Місця роботи"
      action={
        showStake && stakeParts.length > 0 ? (
          // `text-sm`, matching the heading's own line box. At `text-base` the
          // total stood 4px taller than the `<h2>` beside it, so the card grew
          // the moment a reader was allowed to see a ставка at all.
          <span className="flex items-baseline gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Ставка · разом</span>
            <span className="font-semibold tabular-nums">{formatStake(total)}</span>
          </span>
        ) : undefined
      }
    >
      <Fields>
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
                trailing={stake(staff.department.id)}
              />
            )}
            {staff.partTimeDepartments.map((pd) => (
              <PositionEntry
                key={pd.department.id}
                badge="Сумісництво"
                faculty={pd.department.faculty?.name}
                facultyHref={
                  pd.department.faculty ? `/faculties/${pd.department.faculty.id}` : null
                }
                department={pd.department.name}
                departmentHref={`/departments/${pd.department.id}`}
                trailing={stake(pd.department.id)}
              />
            ))}
            {/* A відділ is a place of work and not a кафедра: nobody is paid a
                ставка by one, so no column for it. */}
            {staff.division && (
              <PositionEntry
                badge="Відділ"
                department={staff.division.name}
                departmentHref={`/divisions/${staff.division.id}`}
              />
            )}
          </div>
        )}
      </Fields>
    </Card>
  );
}

import type { StaffDetail } from '@/lib/queries/get-staff';
import { ACADEMIC_TITLE_LABELS, ADMIN_POSITION_LABELS, STAFF_POSITION_LABELS } from '@/lib/labels';
import {
  HONORARY_TITLES,
  degreeTitle,
  diplomaDocument,
  degreeLevel,
  optionLabel,
} from '@/lib/staff/academic-options';
import { Check, FileText } from 'lucide-react';
import { degreesOf } from '@/lib/staff/academic';
import { formatStake } from '@/lib/stake/units';
import { OrcidField } from '@/components/profile/orcid-field';
import { Card } from '@/components/aurora/ui/card';
import { Fields, Field, MaybeField, PositionEntry, ProfileLink } from './primitives';
import { CertificateView } from './certificate-view';
import { DiplomaFileButton } from './diploma-file-button';
import { CERTIFICATE_KINDS, CERTIFICATE_TITLES } from '@/lib/language-certificates/options';
import type { PersonCertificates } from '@/lib/queries/get-language-certificates';
import { ValueShimmer } from './value-shimmer';

/**
 * The detail cards, one component per section.
 *
 * Two rules run through all of them:
 *
 * 1. **Every row is rendered; a blank one shows «—»** (owner, 2026-09-09). It
 *    used to be the reverse, and §5 of `docs/aurora.md` carries the argument
 *    that changed it: a card is a shape, not a list, and one that loses four of
 *    its six fields reads as broken rather than as empty. Hiding the row hid
 *    the LABEL too, so «no ORCID recorded» and «ORCID is not tracked here»
 *    looked identical. `showEmpty` survives as the escape hatch, now defaulting
 *    to true.
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

/**
 * Every heading and label these cards print, in one place.
 *
 * **Because the loading state renders them too** (owner, 2026-09-09). A card
 * title and a field label are static text — they do not depend on the record —
 * so the shell can be on screen before any query answers, with a shimmer only
 * where the VALUE goes. Written twice they would drift, which is the whole
 * reason the old grey-box skeletons needed a ruler to line up.
 *
 * The order is the render order: `AcademicCard.Shell` maps these and the card
 * spells them out, so adding a field here and forgetting the card shows up
 * immediately rather than as a silently mis-sized placeholder.
 */
export const CARD_TITLES = {
  /** The edit form's first card — the record page has no equivalent. */
  basics: 'Основна інформація',
  academic: 'Академічна інформація',
  education: 'Освіта',
  research: 'Наукові профілі',
  leadership: 'Керівні посади',
  workplaces: 'Місця роботи',
} as const;

export const ACADEMIC_LABELS = {
  position: 'Посада',
  title: 'Вчене звання',
  experience: 'Науково-педагогічний стаж',
  honorary: 'Почесні звання',
} as const;

/** «Освіта» (owner, 2026-10-06), in render order — the shell maps these too */
export const EDUCATION_LABELS = {
  // The row a person with NO education entry sees. The basic education is an entry
  // of the list now (owner, 2026-10-14), so it is no longer a pair of its own rows.
  degree: 'Дипломи',
} as const;

/** «15.03.2021» from the stored «2021-03-15» — a plain day, so no time zone can move it */
const uaDay = (iso: string) => iso.split('-').reverse().join('.');

export const RESEARCH_LABELS = {
  wos: 'Web of Science',
  scopus: 'Scopus',
  scholar: 'Google Scholar',
  orcid: 'ORCID',
} as const;

interface CardProps {
  staff: StaffDetail;
  showEmpty?: boolean;
}

/** НПП only — посада and звання really are academic-staff data. */
export function AcademicCard({ staff, showEmpty = true }: CardProps) {
  if (!staff.isNpp) return null;

  return (
    <Card title={CARD_TITLES.academic}>
      <Fields columns={2}>
        <MaybeField
          label={ACADEMIC_LABELS.position}
          value={staff.position ? STAFF_POSITION_LABELS[staff.position] : null}
          showEmpty={showEmpty}
        />
        <MaybeField
          label={ACADEMIC_LABELS.title}
          value={staff.academicTitle ? ACADEMIC_TITLE_LABELS[staff.academicTitle] : null}
          showEmpty={showEmpty}
        />
        <MaybeField
          label={ACADEMIC_LABELS.experience}
          value={
            staff.pedagogicalExperience !== null ? `${staff.pedagogicalExperience} років` : null
          }
          showEmpty={showEmpty}
        />
        <MaybeField
          label={ACADEMIC_LABELS.honorary}
          value={
            staff.honoraryTitles.length
              ? staff.honoraryTitles.map((t) => optionLabel(HONORARY_TITLES, t)).join(', ')
              : null
          }
          showEmpty={showEmpty}
        />
      </Fields>
    </Card>
  );
}

/**
 * «Освіта» (owner, 2026-10-06): the basic education the rating asks about, and
 * every diploma the person holds, one card each (owner, 2026-10-10: a list of
 * cards, not two slots and not a table). A card reads «ступінь» over
 * «спеціальність – дата – відповідає кафедрі ✓»; a blank part is left out.
 */
export function EducationCard({
  staff,
  showEmpty = true,
  certificates,
  canOpenCertificateFiles = false,
}: CardProps & {
  /**
   * The two language certificates (owner, 2026-10-14). Absent where the page did
   * not load them — the card then simply has none to show.
   */
  certificates?: PersonCertificates;
  /** Decided by the route: may THIS viewer open the scans? */
  canOpenCertificateFiles?: boolean;
}) {
  if (!staff.isNpp) return null;

  // Доктор, then кандидат, then the basic education — a stable sort, so within a
  // level the person's own order stands.
  const LEVEL_ORDER = { doctor: 0, candidate: 1, basic: 2 } as const;
  const rank = (degree: string) => LEVEL_ORDER[degreeLevel(degree) ?? 'candidate'];
  const records = degreesOf(staff as unknown as Record<string, unknown>).sort(
    (a, b) => rank(a.degree) - rank(b.degree)
  );

  return (
    <Card title={CARD_TITLES.education}>
      <div className="space-y-5">
        {records.length > 0 ? (
          <div className="space-y-3">
            {records.map((d, i) => {
              const detail = [d.specialty, d.defenceDate ? uaDay(d.defenceDate) : null].filter(
                Boolean
              );
              return (
                <div key={i} className="rounded-xl border bg-muted/30 px-4 py-3">
                  <p className="font-medium">{degreeTitle(d.degree, d.basicLevel)}</p>
                  {d.topic && (
                    <p className="mt-0.5 text-sm text-foreground-soft">Тема: {d.topic}</p>
                  )}
                  {(detail.length > 0 || d.matchesDepartment) && (
                    <p className="mt-0.5 text-sm text-foreground-soft">
                      {detail.join(' – ')}
                      {detail.length > 0 && d.matchesDepartment && ' – '}
                      {d.matchesDepartment && (
                        <span className="inline-flex items-center gap-1">
                          відповідає кафедрі
                          <Check className="size-3.5 text-success" aria-hidden />
                        </span>
                      )}
                    </p>
                  )}
                  {diplomaDocument(d) && (
                    <p className="mt-0.5 text-sm text-foreground-soft">{diplomaDocument(d)}</p>
                  )}
                  {/* The scan (owner, 2026-10-27): its name for everybody who
                      reads «Освіта», the file itself only for those who may open
                      a person's scans — the certificates' rule. */}
                  {d.scanName && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground-soft">
                      <FileText className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{d.scanName}</span>
                      {canOpenCertificateFiles && d.id && (
                        <DiplomaFileButton diplomaId={d.id} fileName={d.scanName} />
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          showEmpty && (
            <Fields>
              <MaybeField label={EDUCATION_LABELS.degree} value={null} showEmpty />
            </Fields>
          )
        )}
        {certificates && (
          <CertificateView
            staffId={staff.id}
            certificates={certificates}
            canOpenFiles={canOpenCertificateFiles}
            showEmpty={showEmpty}
          />
        )}
      </div>
    </Card>
  );
}

/** The same shape with a shimmer for every value — nothing jumps when it loads */
EducationCard.Shell = function EducationCardShell({ isNpp = true }: { isNpp?: boolean }) {
  if (!isNpp) return null;
  // Keyed by its label: the certificates' two rows are mapped, and a list of
  // unkeyed elements is a React warning in the console.
  const shimmer = (label: string) => <Field key={label} label={label} value={<ValueShimmer />} />;
  return (
    <Card title={CARD_TITLES.education}>
      <div className="space-y-5">
        <div className="rounded-xl border bg-muted/30 px-4 py-3">
          <ValueShimmer />
        </div>
        {/* The two language certificates' labels are static text too (2026-10-14). */}
        <Fields>{CERTIFICATE_KINDS.map((kind) => shimmer(CERTIFICATE_TITLES[kind]))}</Fields>
      </div>
    </Card>
  );
};

/**
 * The card with its real title and labels, and a shimmer where each value goes.
 *
 * Nothing for a non-НПП, exactly like the card: `AcademicCard` returns null for
 * one, so a shell here would promise a card that never arrives.
 */
AcademicCard.Shell = function AcademicCardShell({ isNpp = true }: { isNpp?: boolean }) {
  if (!isNpp) return null;
  return (
    <Card title={CARD_TITLES.academic}>
      <Fields columns={2}>
        {Object.values(ACADEMIC_LABELS).map((label) => (
          <Field key={label} label={label} value={<ValueShimmer />} />
        ))}
      </Fields>
    </Card>
  );
};

export function ResearchProfilesCard({ staff, showEmpty = true }: CardProps) {
  const any =
    staff.wosUrl || staff.scopusUrl || staff.googleScholarUrl || staff.orcidId || showEmpty;
  if (!any) return null;

  return (
    <Card title={CARD_TITLES.research}>
      <Fields>
        {staff.wosUrl ? (
          <ProfileLink
            label={RESEARCH_LABELS.wos}
            href={staff.wosUrl}
            count={staff.wosCitationCount}
          />
        ) : (
          showEmpty && <Field label={RESEARCH_LABELS.wos} value="—" />
        )}
        {staff.scopusUrl ? (
          <ProfileLink
            label={RESEARCH_LABELS.scopus}
            href={staff.scopusUrl}
            count={staff.scopusCitationCount}
          />
        ) : (
          showEmpty && <Field label={RESEARCH_LABELS.scopus} value="—" />
        )}
        {staff.googleScholarUrl ? (
          <ProfileLink
            label={RESEARCH_LABELS.scholar}
            href={staff.googleScholarUrl}
            count={staff.googleScholarCitationCount}
          />
        ) : (
          showEmpty && <Field label={RESEARCH_LABELS.scholar} value="—" />
        )}
        {(staff.orcidId || showEmpty) && <OrcidField value={staff.orcidId} />}
      </Fields>
    </Card>
  );
}

ResearchProfilesCard.Shell = function ResearchProfilesCardShell() {
  return (
    <Card title={CARD_TITLES.research}>
      <Fields>
        {Object.values(RESEARCH_LABELS).map((label) => (
          <Field key={label} label={label} value={<ValueShimmer />} />
        ))}
      </Fields>
    </Card>
  );
};

/**
 * Every post this person holds.
 *
 * Headship is derived from `headId`/`deanId`, never from a Role — one person is
 * routinely a завідувач, an НПП and a division editor at once. The posts picked
 * by hand sit beside it — a завідувач may also be вчений секретар (owner,
 * 2026-10-06).
 *
 * **The administrative posts live here.** «Академічна інформація» is НПП-only,
 * so an administrative employee's «проректор» would have nowhere else to go.
 *
 * **The exception to «every field renders».** No `showEmpty`, at any price.
 *
 * §5 says a blank field shows «—», because most of them describe something
 * everybody has some value for — a звання, a стаж, a ступінь — and a dash there
 * means «nobody has filled this in yet».
 *
 * A post is not that kind of field (owner, 2026-09-09). It is held or it is
 * not, and almost nobody holds one: of ~300 people there are 31 завідувачі and
 * 8 деканів. «Декан факультету —» does not read as «not a декан», it reads as a
 * record somebody forgot to complete, on nearly every profile in the app. So a
 * post that is not held is absent, and somebody holding none has no card.
 */
export function LeadershipCard({ staff }: { staff: StaffDetail }) {
  if (!staff.headOfDepartment && !staff.deanOfFaculty && staff.adminPositions.length === 0) {
    return null;
  }

  return (
    <Card title={CARD_TITLES.leadership}>
      <Fields>
        <MaybeField
          label="Адміністративні посади"
          value={
            staff.adminPositions.length
              ? staff.adminPositions.map((p) => ADMIN_POSITION_LABELS[p]).join(', ')
              : null
          }
          showEmpty={false}
        />
        <MaybeField
          label="Завідувач кафедри"
          value={staff.headOfDepartment?.name}
          showEmpty={false}
        />
        <MaybeField label="Декан факультету" value={staff.deanOfFaculty?.name} showEmpty={false} />
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
  showEmpty = true,
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

/**
 * **A guess, and the only one left.** «Місця роботи» is one кафедра, or two, or
 * two plus a відділ — 1 to 3 rows with nothing to derive it from before the row
 * is read. Two is the common case. The card below it, «Керівні посади», exists
 * for 39 people out of ~300 and is not drawn at all: a placeholder for a card
 * that usually is not there would be wrong far more often than right.
 */
WorkplacesCard.Shell = function WorkplacesCardShell() {
  return (
    <Card title={CARD_TITLES.workplaces}>
      <Fields>
        {/* «Основне» is the label every record has; a сумісництво row and a
            відділ are extra and cannot be known before the record is read, so
            the shell shows the one that is always there. */}
        <Field label="Основне" value={<ValueShimmer className="h-5 w-96 max-w-full" />} />
      </Fields>
    </Card>
  );
};

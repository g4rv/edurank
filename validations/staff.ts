import { z } from 'zod';
import {
  hasDomainHost,
  hostMatches,
  withProtocol,
  SCHOLAR_HOSTS,
  SCOPUS_HOSTS,
  WOS_HOSTS,
} from '@/lib/link-hosts';
import { isValidOrcid } from '@/lib/orcid';
import {
  CANDIDATE_DEGREES,
  DOCTOR_DEGREES,
  HONORARY_TITLES,
  UNSPECIFIED_CANDIDATE,
  UNSPECIFIED_DOCTOR,
} from '@/lib/staff/academic-options';
import { adminPostProblem, type AdminPostProblem } from '@/lib/staff/academic';

const str = (v: unknown) =>
  v === '' || v === undefined || (typeof v === 'string' && !v.trim()) ? null : v;
const num = (v: unknown) =>
  v === '' || v === null || v === undefined ? null : isNaN(Number(v)) ? null : Number(v);
const boolStr = (v: unknown) =>
  v === '' || v === null || v === undefined ? null : v === true || v === 'true' ? true : false;

/**
 * A calendar date from an `<input type="date">` («2024-05-20»), stored as a
 * `DateTime`. Parsed as UTC midnight rather than through `new Date(string)`'s
 * local-timezone path, so a defence on the 1st does not become the 30th of the
 * previous month for anyone east of UTC — the Характеристика reads the YEAR off
 * this, and a year boundary is exactly where that slip would land.
 */
const dateStr = (v: unknown) => {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * A Ukrainian mobile number, stored as «+380XXXXXXXXX» or not at all.
 *
 * Enforced here and not only in `TelInput`, like every other rule in this app:
 * the field makes a wrong number hard to type, the schema makes it impossible
 * to save. It refuses a FRAGMENT specifically — the field hands out null until
 * all nine digits are there, so a half-typed number arrives as empty and is
 * simply not stored, but a request made outside the UI could still carry one.
 *
 * There is no legacy format to accept: `Staff.phone` held nothing at all on any
 * of the 330 rows when this was written (2026-08-24).
 */
const phoneField = z.preprocess(
  str,
  z
    .string()
    .regex(/^\+380\d{9}$/, { error: 'Вкажіть номер повністю: +380 та 9 цифр' })
    .nullable()
);

/**
 * An optional profile link that must point at the right service. Empty stays
 * null — these are optional — but a filled value has to be a real URL on that
 * site, otherwise the profile page renders a dead link nobody notices.
 */
const profileLink = (hosts: readonly string[], error: string) =>
  z.preprocess(
    str,
    z
      .string()
      .transform(withProtocol)
      .pipe(z.url({ error: 'Некоректне посилання' }).max(2000))
      .refine(hasDomainHost, { error: 'Некоректне посилання' })
      .refine((v) => hostMatches(v, hosts), { error })
      .nullable()
  );

/** A date in a sane range — a typo must not land a defence in 1024 or 2924 */
const defenceDate = z.preprocess(
  dateStr,
  z
    .date()
    .refine((d) => d.getUTCFullYear() >= 1950 && d.getUTCFullYear() <= 2100, {
      error: 'Некоректна дата',
    })
    .nullable()
);

/** One of a list's keys, or nothing */
const oneOf = (list: readonly { value: string }[], error: string) =>
  z.preprocess(
    str,
    z
      .string()
      .refine((v) => list.some((o) => o.value === v), { error })
      .nullable()
  );

/** A badge list: keys of the list, each once, in the order they were added */
const badges = <T extends string>(item: z.ZodType<T>) =>
  z
    .array(item)
    .default([])
    .transform((list) => [...new Set(list)]);

/** Every `AdminPosition` — one per real post since 2026-10-06 */
export const ADMIN_POSITIONS = [
  'VICE_RECTOR',
  'DEAN',
  'VICE_DEAN',
  'ACADEMIC_SECRETARY',
  'ADMISSION_SECRETARY',
  'DEPARTMENT_HEAD',
  'UNIT_HEAD',
  'DEPUTY_DEPARTMENT_HEAD',
  'DEPUTY_ADMISSION_SECRETARY',
  'LAB_HEAD',
  'CENTER_HEAD',
] as const;

/**
 * Why a set of administrative posts cannot be held together (owner,
 * 2026-10-06) — see `adminPostProblem`. The form shows it under the badge list;
 * the save and the кафедра / факультет screens show it when a headship is what
 * makes the second post.
 */
export const ADMIN_POST_PROBLEM_MESSAGES: Record<AdminPostProblem, string> = {
  VICE_RECTOR_ALONE: 'Проректор не обіймає інших адміністративних посад',
  ONE_LEADING:
    'Керівна посада може бути лише одна: проректор, декан, завідувач кафедри або керівник відділу',
};

const specialty = z.preprocess(
  str,
  z.string().max(200, { error: 'Занадто довге значення' }).nullable()
);

/**
 * «Академічна інформація» and «Освіта» (owner, 2026-10-06) — the fields an НПП
 * now fills in about themselves, and ADMIN and granted editors about anybody.
 * Shared by `staffUpdateSchema` and `ownProfileSchema`, so the two forms can
 * never accept different values.
 *
 * The old `academicRank`, `scientificDegree`, `degreeDefenceDate` and
 * `adminPosition` are NOT here: nobody types them any more. Every save derives
 * them from these (`lib/staff/academic.ts`), because the rating still reads
 * them.
 */
export const academicFields = {
  pedagogicalExperience: z.preprocess(num, z.number().int().nonnegative().nullable()),
  position: z.preprocess(
    str,
    z.enum(['LECTURER', 'SENIOR_LECTURER', 'DOCENT', 'PROFESSOR']).nullable()
  ),
  academicTitle: z.preprocess(str, z.enum(['SENIOR_RESEARCHER', 'DOCENT', 'PROFESSOR']).nullable()),
  honoraryTitles: badges(
    z.string().refine((v) => HONORARY_TITLES.some((o) => o.value === v), {
      error: 'Невідоме почесне звання',
    })
  ),
  // Several posts, but one leading one at most (owner, 2026-10-06). Only the
  // picked list is judged here; a headship is the database's to know, so the
  // save checks the pair again (`adminPostProblem` with the headship).
  adminPositions: badges(z.enum(ADMIN_POSITIONS)).superRefine((list, ctx) => {
    const problem = adminPostProblem(list);
    if (problem) ctx.addIssue({ code: 'custom', message: ADMIN_POST_PROBLEM_MESSAGES[problem] });
  }),
  // The placeholder is no option (`UNSPECIFIED_CANDIDATE`), but a form re-sends
  // what is stored: refusing it would block every save — a phone number, by an
  // admin who cannot know the branch — until somebody chose the degree.
  candidateDegree: oneOf(
    [...CANDIDATE_DEGREES, { value: UNSPECIFIED_CANDIDATE }],
    'Оберіть ступінь зі списку'
  ),
  candidateSpecialty: specialty,
  candidateDefenceDate: defenceDate,
  candidateMatchesDepartment: z.preprocess(boolStr, z.boolean().nullable()),
  doctorDegree: oneOf(
    [...DOCTOR_DEGREES, { value: UNSPECIFIED_DOCTOR }],
    'Оберіть ступінь зі списку'
  ),
  doctorSpecialty: specialty,
  doctorDefenceDate: defenceDate,
  doctorMatchesDepartment: z.preprocess(boolStr, z.boolean().nullable()),
  basicEducationMatch: z.preprocess(boolStr, z.boolean().nullable()),
  basicEducationSpecialty: specialty,
};

export const staffUpdateSchema = z
  .object({
    lastName: z.string().trim().min(1, { error: "Обов'язкове поле" }),
    firstName: z.string().trim().min(1, { error: "Обов'язкове поле" }),
    patronymic: z.string().trim().min(1, { error: "Обов'язкове поле" }),
    // Stored exactly as typed. Deliberately NOT lower-cased (2026-08-31).
    //
    // Case never decides who an address belongs to, and nothing here needs it
    // folded: `emailMatches` already compares case-insensitively at every point
    // an address is looked up — sign-in and password reset — which is the only
    // place the question is ever asked.
    //
    // What lower-casing here actually did was edit a field nobody touched.
    // Saving somebody's phone number also rewrote their «Name.Surname@…»
    // address to lower case and filed it in the audit log as a change the
    // admin had made (reported from production, 2026-08-31).
    //
    // It enforced nothing either: the seeds, `db:seed:staff`, the invite
    // import and any direct insert never pass through this schema. Uniqueness
    // that ignores case belongs in a `lower(email)` unique index, where the
    // database can hold it — not in a form validator that only some writes go
    // through.
    email: z.email({ error: 'Некоректний email' }).trim(),
    phone: phoneField,
    isNpp: z.preprocess((v) => v === true || v === 'true', z.boolean()),
    employmentRate: z.preprocess(num, z.number().nonnegative().nullable()),
    ...academicFields,
    wosUrl: profileLink(WOS_HOSTS, 'Очікується посилання на Web of Science'),
    wosCitationCount: z.preprocess(num, z.number().int().nonnegative().nullable()),
    scopusUrl: profileLink(SCOPUS_HOSTS, 'Очікується посилання на Scopus'),
    scopusCitationCount: z.preprocess(num, z.number().int().nonnegative().nullable()),
    googleScholarUrl: profileLink(SCHOLAR_HOSTS, 'Очікується посилання на Google Scholar'),
    googleScholarCitationCount: z.preprocess(num, z.number().int().nonnegative().nullable()),
    // Checksum-validated, the same treatment `isbn` gets in activity
    // evidence: an ORCID carries an ISO 7064 check digit, so a mistyped one
    // is detectable rather than merely wrong. The field stays optional —
    // `str` turns an empty box into null, and `nullable` skips the refine.
    orcidId: z.preprocess(
      str,
      z
        .string()
        .max(50, { error: 'Занадто довге значення' })
        .refine(isValidOrcid, { error: 'Некоректний ORCID' })
        .nullable()
    ),
    departmentId: z.preprocess(str, z.string().nullable()),
    divisionId: z.preprocess(str, z.string().nullable()),
    // Part-time POSTS, not «additional кафедри» (owner, 2026-08-26). A person
    // whose main job is elsewhere can hold one on two кафедри and a full-time
    // post on neither, so the array itself allows two — the total is what is
    // capped, in the refine below.
    partTimeDepartmentIds: z
      .array(z.string())
      .max(2, { error: 'НПП може працювати щонайбільше на двох кафедрах' })
      .default([]),
  })
  .superRefine((data, ctx) => {
    // AT LEAST ONE кафедра, not «a primary one» (owner, 2026-08-26). An НПП
    // may hold only an additional post, and «основна» was then a box somebody
    // had to tick rather than a fact about the person.
    //
    // With `departmentId` null every кафедра they are on reads as сумісник,
    // which is the right answer and needs no new column: `boundsFallbackFor`
    // gives them 0,10–0,25, `onDepartment` still finds them, the badge shows,
    // and `get-department-knpp` already skips a null primary.
    //
    // The guard stays, because nothing replaces it: an НПП attached to no
    // кафедра at all is absent from every list, grid and Кнпп, and there is no
    // screen on which that mistake becomes visible.
    if (data.isNpp && !data.departmentId && data.partTimeDepartmentIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'НПП повинен мати кафедру — основну або додаткову',
        path: ['departmentId'],
      });
    }

    // TWO WORKPLACES IN TOTAL, counting the full-time post. The array's own
    // `.max(2)` covers somebody with no full-time post; this covers the rest.
    if (
      (data.departmentId ? 1 : 0) + data.partTimeDepartmentIds.length > 2 &&
      data.partTimeDepartmentIds.length <= 2
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'НПП може працювати щонайбільше на двох кафедрах',
        path: ['partTimeDepartmentIds'],
      });
    }

    // Saved, it would put the same person in one кафедра's grid twice — once as
    // its own staff and once as a сумісник — with two different ceilings.
    if (data.departmentId && data.partTimeDepartmentIds.includes(data.departmentId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Додаткова кафедра не може збігатися з основною',
        path: ['partTimeDepartmentIds'],
      });
    }

    // The same reason, one level down: two part-time rows on one кафедра would
    // be one person twice in that кафедра's grid.
    if (new Set(data.partTimeDepartmentIds).size !== data.partTimeDepartmentIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Кафедра вказана двічі',
        path: ['partTimeDepartmentIds'],
      });
    }
  });

export type StaffUpdateSchema = z.infer<typeof staffUpdateSchema>;

export const staffCreateSchema = staffUpdateSchema;
export type StaffCreateSchema = StaffUpdateSchema;

/**
 * What a person may change about themselves, whatever their role: how to reach
 * them, where their public research profiles are, and — since 2026-10-06, until
 * HR owns it — their own «Академічна інформація» and «Освіта». Everything else
 * on a Staff row — name, department, ставка — is somebody else's to set, which
 * is why this is a separate shape from staffUpdateSchema rather than a subset.
 *
 * Kept in step with USER_EDITABLE_STAFF_FIELDS in lib/permissions.ts, which
 * filters the write again on the server.
 */
export const ownProfileSchema = z.object({
  phone: phoneField,
  wosUrl: profileLink(WOS_HOSTS, 'Очікується посилання на Web of Science'),
  scopusUrl: profileLink(SCOPUS_HOSTS, 'Очікується посилання на Scopus'),
  googleScholarUrl: profileLink(SCHOLAR_HOSTS, 'Очікується посилання на Google Scholar'),
  orcidId: z.preprocess(
    str,
    z
      .string()
      .max(50, { error: 'Занадто довге значення' })
      .refine(isValidOrcid, { error: 'Некоректний ORCID' })
      .nullable()
  ),
  // Citation counts (owner, 2026-10-06) — the same rule as the staff form's.
  wosCitationCount: z.preprocess(num, z.number().int().nonnegative().nullable()),
  scopusCitationCount: z.preprocess(num, z.number().int().nonnegative().nullable()),
  googleScholarCitationCount: z.preprocess(num, z.number().int().nonnegative().nullable()),
  ...academicFields,
});

export type OwnProfileSchema = z.infer<typeof ownProfileSchema>;

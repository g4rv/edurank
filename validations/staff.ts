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

export const staffUpdateSchema = z
  .object({
    lastName: z.string().trim().min(1, { error: "Обов'язкове поле" }),
    firstName: z.string().trim().min(1, { error: "Обов'язкове поле" }),
    patronymic: z.string().trim().min(1, { error: "Обов'язкове поле" }),
    // Lower-cased, not just trimmed. `Staff.email` is unique but Postgres
    // enforces that case-sensitively, so «Petrenko@…» and «petrenko@…» are two
    // rows to the database and one address to every human. Stored one way, the
    // ambiguity never arises (2026-08-28).
    email: z.email({ error: 'Некоректний email' }).trim().toLowerCase(),
    phone: phoneField,
    isNpp: z.preprocess((v) => v === true || v === 'true', z.boolean()),
    employmentRate: z.preprocess(num, z.number().nonnegative().nullable()),
    pedagogicalExperience: z.preprocess(num, z.number().int().nonnegative().nullable()),
    academicRank: z.preprocess(
      str,
      z.enum(['LECTURER', 'SENIOR_LECTURER', 'DOCENT', 'PROFESSOR']).nullable()
    ),
    scientificDegree: z.preprocess(str, z.enum(['CANDIDATE', 'DOCTOR']).nullable()),
    degreeMatchesDepartment: z.preprocess(boolStr, z.boolean().nullable()),
    // Характеристика п.5 — one date, for the highest degree only. Bounded so a
    // typo cannot land a defence in 1024 or 2924: the document tests whether it
    // falls inside a five-year window, and either extreme would silently answer
    // «no» with nothing on screen to explain it.
    degreeDefenceDate: z.preprocess(
      dateStr,
      z
        .date()
        .refine((d) => d.getUTCFullYear() >= 1950 && d.getUTCFullYear() <= 2100, {
          error: 'Некоректна дата',
        })
        .nullable()
    ),
    adminPosition: z.preprocess(
      str,
      z
        .enum([
          'VICE_RECTOR',
          'DEAN',
          'VICE_DEAN_OR_SECRETARY',
          'DEPARTMENT_OR_UNIT_HEAD',
          'DEPUTY_DEPARTMENT_HEAD',
          'DEPUTY_ADMISSION_SECRETARY',
          'LAB_OR_CENTER_HEAD',
        ])
        .nullable()
    ),
    basicEducationMatch: z.preprocess(boolStr, z.boolean().nullable()),
    basicEducationSpecialty: z.preprocess(
      str,
      z.string().max(200, { error: 'Занадто довге значення' }).nullable()
    ),
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
 * them and where their public research profiles are. Everything else on a Staff
 * row — name, department, звання, ставка — is somebody else's to set, which is
 * why this is a separate, much smaller shape than staffUpdateSchema rather than
 * a subset of it.
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
});

export type OwnProfileSchema = z.infer<typeof ownProfileSchema>;

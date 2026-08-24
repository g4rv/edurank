import { z } from 'zod';
import {
  hasDomainHost,
  hostMatches,
  withProtocol,
  SCHOLAR_HOSTS,
  SCOPUS_HOSTS,
  WOS_HOSTS,
} from '@/lib/link-hosts';

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
    email: z.email({ error: 'Некоректний email' }).trim(),
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
    orcidId: z.preprocess(str, z.string().max(50, { error: 'Занадто довге значення' }).nullable()),
    departmentId: z.preprocess(str, z.string().nullable()),
    divisionId: z.preprocess(str, z.string().nullable()),
    // At most one. A person holds two кафедри in total — their own and one
    // more (owner, 2026-08-24). Kept an array rather than a nullable string:
    // the join table is many-to-many, the action already diffs it as a set,
    // and «two» is a policy that can change without a migration.
    partTimeDepartmentIds: z
      .array(z.string())
      .max(1, { error: 'НПП може працювати щонайбільше на двох кафедрах' })
      .default([]),
  })
  .superRefine((data, ctx) => {
    if (data.isNpp && !data.departmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'НПП повинен мати основну кафедру',
        path: ['departmentId'],
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
  orcidId: z.preprocess(str, z.string().max(50, { error: 'Занадто довге значення' }).nullable()),
});

export type OwnProfileSchema = z.infer<typeof ownProfileSchema>;

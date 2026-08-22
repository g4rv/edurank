import type {
  AcademicRank,
  ActivityStatus,
  AdminPosition,
  InputSource,
  Prisma,
  RatingYearStatus,
  Role,
  ScientificDegree,
  SubmittedByRole,
} from '../lib/generated/prisma/client';

// The shape `pnpm data:export` writes and `pnpm db:seed:core` reads.
//
// One file, so the two ends cannot drift: adding a Staff column and forgetting
// the importer is a type error rather than a column that silently arrives empty
// in production.
//
// Every cross-reference is a natural key — an email, a кафедра's name, an
// indicator's `code`. See the header of `core-export.ts` for why.

/** Gitignored: ~300 real colleagues, their addresses and their scores. */
export const CORE_DATA_FILE = 'prod-core.json';

export interface CoreDivision {
  name: string;
  registryKey: string | null;
  canModerateRating: boolean;
}

export interface CoreFaculty {
  name: string;
  deanEmail: string | null;
}

export interface CoreDepartment {
  name: string;
  facultyName: string;
  headEmail: string | null;
}

export interface CoreStaff {
  email: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  phone: string | null;
  role: Role;
  isNpp: boolean;
  isSystem: boolean;
  archivedAt: string | null;
  archiveReason: string | null;
  employmentRate: number | null;
  pedagogicalExperience: number | null;
  academicRank: AcademicRank | null;
  scientificDegree: ScientificDegree | null;
  degreeMatchesDepartment: boolean | null;
  degreeDefenceDate: string | null;
  adminPosition: AdminPosition | null;
  basicEducationMatch: boolean | null;
  basicEducationSpecialty: string | null;
  wosUrl: string | null;
  wosCitationCount: number | null;
  scopusUrl: string | null;
  scopusCitationCount: number | null;
  googleScholarUrl: string | null;
  googleScholarCitationCount: number | null;
  orcidId: string | null;
  departmentName: string | null;
  divisionName: string | null;
  partTimeDepartmentNames: string[];
}

export interface CoreActivityType {
  code: string;
  label: string;
  sectionNumber: number;
  order: number;
  itemNumber: string;
  maxPerYear: number | null;
  evidenceFields: Prisma.JsonValue;
  scoring: Prisma.JsonValue;
  coefficient: number;
  coefficientNote: string | null;
  inputSource: InputSource;
  verifyingDivisionName: string | null;
  isActive: boolean;
  requiresVerification: boolean;
  entityFirstEntry: boolean;
  licencePositions: Prisma.JsonValue;
}

export interface CoreTemplate {
  year: number;
  name: string;
  isActive: boolean;
  status: RatingYearStatus;
  closedAt: string | null;
  sections: { number: number; title: string }[];
  activityTypes: CoreActivityType[];
}

export interface CoreActivity {
  staffEmail: string;
  typeYear: number;
  typeCode: string;
  year: number;
  evidence: Prisma.JsonValue;
  computedValue: number;
  score: number;
  status: ActivityStatus;
  submittedByRole: SubmittedByRole;
  approvedAt: string | null;
  removedAt: string | null;
  removeReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface CoreRatingEntry {
  staffEmail: string;
  year: number;
  section1Score: number;
  section2Score: number;
  section3Score: number;
  section4Score: number;
  section5Score: number;
  totalScore: number;
  snapshot: Prisma.JsonValue;
}

export interface CoreData {
  exportedAt: string;
  divisions: CoreDivision[];
  faculties: CoreFaculty[];
  departments: CoreDepartment[];
  staff: CoreStaff[];
  templates: CoreTemplate[];
  activities: CoreActivity[];
  ratingEntries: CoreRatingEntry[];
}

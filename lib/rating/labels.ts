import type {
  ActivityStatus,
  InputSource,
  RatingYearStatus,
  SubmittedByRole,
} from '@/lib/generated/prisma/client';
import type { ActivityKind } from '@/lib/rating/activity-types';

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  PENDING: 'Очікує підтвердження',
  APPROVED: 'Підтверджено',
  REMOVED: 'Відхилено',
};

export const INPUT_SOURCE_LABELS: Record<InputSource, string> = {
  NPP_SUBMISSION: 'Подає НПП',
  DIVISION_MANAGED: 'Вносить відділ',
  PROFILE_DERIVED: 'Автоматично з профілю',
};

export const SUBMITTED_BY_ROLE_LABELS: Record<SubmittedByRole, string> = {
  NPP: 'НПП',
  DIVISION: 'Відділ',
  SYSTEM: 'Автоматично з профілю',
};

export const RATING_YEAR_STATUS_LABELS: Record<RatingYearStatus, string> = {
  OPEN: 'Відкритий',
  CLOSED: 'Закритий',
};

// Як рахуються бали показника (пояснення для нетехнічних користувачів)
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  FIXED: 'Фіксовані бали',
  MULT: 'Бали × кількість',
  SELECT: 'Бали за обраний варіант',
  SELECT_MULT: 'Варіант × кількість',
  GATE: 'Усе або нічого',
};

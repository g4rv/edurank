import type {
  ActivityStatus,
  InputSource,
  RatingYearStatus,
  SubmittedByRole,
} from '@/lib/generated/prisma/client';

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  PENDING: 'Очікує підтвердження',
  APPROVED: 'Підтверджено',
  REMOVED: 'Відхилено',
};

export const INPUT_SOURCE_LABELS: Record<InputSource, string> = {
  NPP_SUBMISSION: 'Подає НПП',
  DIVISION_MANAGED: 'Вносить відділ',
};

export const SUBMITTED_BY_ROLE_LABELS: Record<SubmittedByRole, string> = {
  NPP: 'НПП',
  DIVISION: 'Відділ',
};

export const RATING_YEAR_STATUS_LABELS: Record<RatingYearStatus, string> = {
  OPEN: 'Відкритий',
  CLOSED: 'Закритий',
};

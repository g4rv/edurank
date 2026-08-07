import type { ActivityStatus, InputSource, RatingYearStatus } from '@/lib/generated/prisma/client';
import type { ActivityKind } from '@/lib/rating/activity-types';

// «Зараховано», not «Підтверджено»: submissions are auto-approved, so this says
// nothing about anyone having looked at them — only that the points count. The
// separate «Перевірено» flag is the one that means a human checked the item.
// PENDING is never written (no queue — auto-approve plus post-moderation); the
// label stays only because the enum value does.
export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  PENDING: 'Очікує підтвердження',
  APPROVED: 'Зараховано',
  REMOVED: 'Відхилено',
};

export const INPUT_SOURCE_LABELS: Record<InputSource, string> = {
  NPP_SUBMISSION: 'Подає НПП',
  DIVISION_MANAGED: 'Вносить відділ',
  PROFILE_DERIVED: 'Автоматично з профілю',
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
  CHECK_SUM: 'Сума позначених',
};

import type { Role } from '@/lib/generated/prisma/client';

// Role-based presets for the personnel list (?view=), default 'npp'.
// One axis, no isNpp control — the useful views are role combinations.
export const STAFF_VIEWS = {
  npp: { label: 'НПП', role: 'USER' as Role },
  editors: { label: 'Редактори', role: 'EDITOR' as Role },
  admins: { label: 'Адміністратори', role: 'ADMIN' as Role },
  staff: { label: 'Редактори та НПП', excludeRole: 'ADMIN' as Role },
  all: { label: 'Всі' },
} as const;

export type StaffView = keyof typeof STAFF_VIEWS;

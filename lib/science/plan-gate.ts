/**
 * The rating waits for the science plan (owner, 2026-10-05).
 *
 * An НПП fills in «Розділ 1–5» only once EVERY кафедра they are on holds a
 * SAVED (`lockedAt`) plan for the open навчальний рік. A сумісник is planned on
 * both кафедри and each expects its own, so one saved plan is not enough.
 *
 * **No ставка is no excuse** (owner, 2026-10-05). A plan cannot be started
 * without one, so such a person is held here by something only the завідувач
 * can fix — blocked anyway. The planning screen is what tells them so
 * (`NO_RATE_DETAIL`), and the rating sends them there.
 *
 * **No open science year opens the rating.** Between years nobody can save a
 * plan, and holding the rating to one then would shut it for everybody.
 *
 * Who it binds: a person's OWN submission screens and actions only — the
 * `NPP_RATING_OPEN` gates. ADMIN and division editors entering data for other
 * people, «Мій рейтинг» and the Характеристика are untouched.
 */

export interface PlanGateDepartment {
  id: string;
  name: string;
}

export type PlanGate = { open: true } | { open: false; unsaved: PlanGateDepartment[] };

/** The sentence a refused action returns; the page shows it as its heading. */
export const PLAN_GATE_DETAIL =
  'Спершу збережіть планування наукової роботи — після цього можна заповнювати рейтинг.';

export function planGate(input: {
  hasOpenYear: boolean;
  /** Every кафедра the person is on, primary and additional */
  departments: PlanGateDepartment[];
  /** Their plans in the open year; a кафедра with no row has no plan yet */
  plans: { departmentId: string; lockedAt: Date | null }[];
}): PlanGate {
  if (!input.hasOpenYear) return { open: true };

  const saved = new Set(input.plans.filter((p) => p.lockedAt !== null).map((p) => p.departmentId));
  const unsaved = input.departments.filter((d) => !saved.has(d.id));
  return unsaved.length === 0 ? { open: true } : { open: false, unsaved };
}

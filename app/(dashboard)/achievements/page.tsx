import { redirect } from 'next/navigation';

/**
 * «Мій рейтинг» lives at `/profile/rating` now (owner, 2026-09-09).
 *
 * It was a sidebar item, so a person's own record was three unrelated pages
 * while somebody else's was one record with three tabs. The three moved under
 * `/profile` to become real siblings; this keeps every bookmark and every link
 * in an old invitation working.
 *
 * `/achievements/[section]` — the submission forms — and
 * `/achievements/students` stay where they are. Neither is a view OF the record.
 */
export default function AchievementsIndexRedirect() {
  redirect('/profile/rating');
}

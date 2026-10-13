import { QUALIFICATIONS_TAB_LABEL } from '@/lib/qualifications/options';

export type StaffTabKey = 'profile' | 'rating' | 'kharakterystyka' | 'science' | 'qualifications';

export interface StaffTab {
  key: StaffTabKey;
  label: string;
  href: string;
}

/**
 * The tabs a staff record offers this viewer — pure, so the rule is tested
 * without rendering `StaffTabs`.
 *
 * - **Профіль and Рейтинг** only when the viewer may open them; a завідувач
 *   reads the Характеристика alone (see `StaffTabs`' `showStaffPages`).
 * - **Наукова робота** only for ADMIN and «Перевірка науки» (D43,
 *   `canOverseeScience`), the people who already see all science on
 *   /science-plans (owner, 2026-10-05). A flag on a tab is not a permission:
 *   `/staff/[id]/science` checks it again.
 * - **Підвищення кваліфікації/Стажування** (owner, 2026-10-13) for an НПП's own
 *   record, and on somebody else's for ADMIN and a division with
 *   `canViewQualifications`. Last, so for an overseer nothing already drawn
 *   moves when it appears. Checked again by `/staff/[id]/qualifications`.
 */
export function staffTabList({
  root,
  showStaffPages = true,
  showScience = false,
  showQualifications = false,
}: {
  root: string;
  showStaffPages?: boolean;
  showScience?: boolean;
  showQualifications?: boolean;
}): StaffTab[] {
  return [
    ...(showStaffPages
      ? [
          { key: 'profile' as const, label: 'Профіль', href: root },
          { key: 'rating' as const, label: 'Рейтинг', href: `${root}/rating` },
        ]
      : []),
    { key: 'kharakterystyka', label: 'Характеристика', href: `${root}/kharakterystyka` },
    ...(showStaffPages && showScience
      ? [{ key: 'science' as const, label: 'Наукова робота', href: `${root}/science` }]
      : []),
    ...(showStaffPages && showQualifications
      ? [
          {
            key: 'qualifications' as const,
            label: QUALIFICATIONS_TAB_LABEL,
            href: `${root}/qualifications`,
          },
        ]
      : []),
  ];
}

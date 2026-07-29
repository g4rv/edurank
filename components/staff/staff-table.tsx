'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { ACADEMIC_RANK_LABELS, ROLE_LABELS, SCIENTIFIC_DEGREE_LABELS } from '@/lib/labels';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { AnimatedRow } from '@/components/ui/animated-row';
import { DataTable } from '@/components/ui/data-table';
import type { StaffListItem } from '@/lib/queries/list-staff';

function fullName(s: Pick<TableStaffItem, 'lastName' | 'firstName' | 'patronymic'>) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

type TableStaffItem = Omit<StaffListItem, 'employmentRate'> & { employmentRate?: number | null };

type Props = {
  staff: TableStaffItem[];
  sortHeader: React.ReactNode;
  isAdmin?: boolean;
  /** Scroll rows inside the card instead of growing the page — see DataTable */
  fill?: boolean;
};

export function StaffTable({ staff, sortHeader, isAdmin, fill }: Props) {
  if (staff.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground"
      >
        Записів не знайдено
      </motion.div>
    );
  }

  return (
    <DataTable fill={fill}>
      <thead>{sortHeader}</thead>
      <AnimatedTableBody>
        {staff.map((member) => (
          <AnimatedRow key={member.id} className="relative transition-colors">
            <td className="px-4 py-3 font-medium">
              <Link href={`/staff/${member.id}`} className="absolute inset-0" />
              {fullName(member)}
            </td>
            <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
            <td className="px-4 py-3">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  member.isNpp ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}
              >
                {member.isNpp ? 'НПП' : 'Адм.'}
              </span>
            </td>
            <td className="px-4 py-3 text-muted-foreground">
              {member.department?.name ?? member.division?.name ?? '—'}
            </td>
            <td className="px-4 py-3 text-muted-foreground">
              {member.academicRank
                ? [
                    ACADEMIC_RANK_LABELS[member.academicRank],
                    member.scientificDegree
                      ? SCIENTIFIC_DEGREE_LABELS[member.scientificDegree]
                      : null,
                  ]
                    .filter(Boolean)
                    .join(', ')
                : '—'}
            </td>
            {isAdmin && (
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground">
                    {member.role ? ROLE_LABELS[member.role] : '—'}
                  </span>
                  {member.isActivated === false && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      Не активований
                    </span>
                  )}
                </div>
              </td>
            )}
            {isAdmin && (
              <td className="px-4 py-3 text-muted-foreground tabular-nums">
                {/* «—» like every other empty cell. An amber pill here fires on
                    every staff member without a ставка, which is most of them —
                    at that density it reads as decoration, not as a warning. */}
                {'employmentRate' in member && member.employmentRate != null
                  ? member.employmentRate
                  : '—'}
              </td>
            )}
          </AnimatedRow>
        ))}
      </AnimatedTableBody>
    </DataTable>
  );
}

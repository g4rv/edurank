'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { ACADEMIC_RANK_LABELS, SCIENTIFIC_DEGREE_LABELS } from '@/lib/labels';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { AnimatedRow } from '@/components/ui/animated-row';
import type { StaffListItem } from '@/lib/queries/list-staff';

function fullName(s: Pick<StaffListItem, 'lastName' | 'firstName' | 'patronymic'>) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

type Props = {
  staff: StaffListItem[];
  sortHeader: React.ReactNode;
};

export function StaffTable({ staff, sortHeader }: Props) {
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
    <div className="rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>{sortHeader}</thead>
        <AnimatedTableBody>
          {staff.map((member) => (
            <AnimatedRow
              key={member.id}
              className="relative border-b transition-colors last:border-0 hover:bg-muted/30"
            >
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
            </AnimatedRow>
          ))}
        </AnimatedTableBody>
      </table>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DiscardActivityButton } from '@/components/rating/discard-activity-button';
import { VerifyActivityButton } from '@/components/rating/verify-activity-button';

export interface ModerationRow {
  id: string;
  staffName: string;
  department: string;
  section: number;
  itemNumber: string;
  label: string;
  summary: string;
  score: number;
  status: 'PENDING' | 'APPROVED' | 'REMOVED';
  statusLabel: string;
  removeReason: string | null;
  date: string;
  canDiscard: boolean;
  verified: boolean;
  canVerify: boolean;
}

const STATUS_STYLES: Record<ModerationRow['status'], string> = {
  APPROVED: 'bg-primary/10 text-primary',
  PENDING: 'bg-muted text-muted-foreground',
  REMOVED: 'bg-destructive/10 text-destructive',
};

const SECTIONS = [1, 2, 3, 4, 5];

export function ModerationList({ rows }: { rows: ModerationRow[] }) {
  const [section, setSection] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (section === null || r.section === section) && (!q || r.staffName.toLowerCase().includes(q))
    );
  }, [rows, section, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук за ПІБ..."
            className="w-64 pl-8"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={section === null ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSection(null)}
          >
            Всі
          </Button>
          {SECTIONS.map((s) => (
            <Button
              key={s}
              variant={section === s ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSection(s)}
            >
              Розділ {s}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          Подань не знайдено.
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {filtered.map((row) => (
            // Description first at full width, meta and actions on their own row
            // below. Side by side, a long label pushed the actions down on some
            // rows and not others, so no two rows looked alike.
            <li key={row.id} className="px-5 py-3">
              <div>
                <p className="text-sm font-medium">
                  {row.staffName}
                  {row.department && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      · {row.department}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm">
                  <span className="mr-1.5 text-muted-foreground">{row.itemNumber}</span>
                  {row.label}
                </p>
                {row.summary && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.summary}</p>
                )}
                {row.status === 'REMOVED' && row.removeReason && (
                  <p className="mt-1 text-xs text-destructive">
                    Причина відхилення: {row.removeReason}
                  </p>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{row.date}</span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    STATUS_STYLES[row.status]
                  )}
                >
                  {row.statusLabel}
                </span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    row.status === 'REMOVED' && 'text-muted-foreground line-through'
                  )}
                >
                  {row.score}
                </span>

                {/* Buttons keep to the right edge so their position never moves */}
                <div className="ml-auto flex items-center gap-2">
                  {row.canVerify ? (
                    <VerifyActivityButton activityId={row.id} verified={row.verified} />
                  ) : (
                    row.verified && (
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                        Перевірено
                      </span>
                    )
                  )}
                  {row.canDiscard && (
                    <DiscardActivityButton
                      activityId={row.id}
                      label={row.label}
                      staffName={row.staffName}
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

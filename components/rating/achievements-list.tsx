import { cn } from '@/lib/utils';
import { DeleteActivityButton } from '@/components/rating/delete-activity-button';

export interface AchievementRow {
  id: string;
  itemNumber: string;
  label: string;
  summary: string;
  score: number;
  status: 'PENDING' | 'APPROVED' | 'REMOVED';
  statusLabel: string;
  removeReason: string | null;
  date: string;
  canDelete: boolean;
  /**
   * An indicator the person has nothing under — no activity exists, so there is
   * no status and the 0 is an absence rather than a result. Rendered muted in
   * the rating table and never listed among actual achievements.
   */
  isEmpty?: boolean;
  /** Who fills this one in */
  inputSource?: 'NPP_SUBMISSION' | 'DIVISION_MANAGED' | 'PROFILE_DERIVED';
  /**
   * WHICH відділ fills it, short form. «Вносить відділ» told an НПП that the
   * row was not theirs but not who to ask about it, which is the only thing
   * they can act on.
   */
  division?: string | null;
}

export interface AchievementGroup {
  number: number;
  title: string;
  items: AchievementRow[];
}

const STATUS_STYLES: Record<AchievementRow['status'], string> = {
  APPROVED: 'bg-primary/10 text-primary',
  PENDING: 'bg-muted text-muted-foreground',
  REMOVED: 'bg-destructive/10 text-destructive',
};

export function AchievementsList({ groups }: { groups: AchievementGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        За обраний рік досягнень ще немає.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.number} className="rounded-xl border bg-card">
          <h3 className="border-b px-5 py-3 text-sm font-semibold">
            Розділ {group.number}. {group.title}
          </h3>
          <ul className="divide-y">
            {group.items.map((item) => (
              <li key={item.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="mr-1.5 text-muted-foreground">{item.itemNumber}</span>
                      {item.label}
                    </p>
                    {item.summary && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.summary}
                      </p>
                    )}
                    {item.status === 'REMOVED' && item.removeReason && (
                      <p className="mt-1 text-xs text-destructive">
                        Причина відхилення: {item.removeReason}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">{item.date}</span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_STYLES[item.status]
                      )}
                    >
                      {item.statusLabel}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        item.status === 'REMOVED' && 'text-muted-foreground line-through'
                      )}
                    >
                      {item.score}
                    </span>
                    {item.canDelete && (
                      <DeleteActivityButton activityId={item.id} label={item.label} />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

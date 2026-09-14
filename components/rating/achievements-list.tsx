import { cn } from '@/lib/utils';
import { Badge } from '@/components/aurora/ui/badge';
import { Card, EmptyState } from '@/components/aurora/ui/card';
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

/**
 * The shared `Badge`, not a hand-rolled pill. It was three class strings here
 * and a fourth set in `moderation-list` — §3 fixes what each tone means, and a
 * status should not look different depending on which screen shows it.
 *
 * `APPROVED` is `brand`, not `ok`: green says «verified», and this app has no
 * approval queue — a submission counts the moment it is saved, so «Зараховано»
 * means «counts», not «somebody checked it». The badge's own table calls
 * `brand` «a classification, not a state», which is exactly right here.
 */
const STATUS_TONE: Record<AchievementRow['status'], 'brand' | 'muted' | 'destructive'> = {
  APPROVED: 'brand',
  PENDING: 'muted',
  REMOVED: 'destructive',
};

export function AchievementsList({ groups }: { groups: AchievementGroup[] }) {
  if (groups.length === 0) {
    return <EmptyState>За цей рік досягнень ще немає.</EmptyState>;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        // **No group heading** (owner, 2026-09-11). It printed «Розділ N.
        // Title» at the top of the card, directly under the page's own `h1`
        // saying the same words — this list only ever holds the section the
        // route names. `group.number` and `group.title` stay on the type
        // because `toAchievementGroups` is shared with the rating table, where
        // several sections DO appear at once.
        <Card key={group.number} padding="none">
          <ul className="divide-y">
            {group.items.map((item) => (
              <li key={item.id} className="px-5 py-3">
                {/* `items-center`, not `items-start` (owner, 2026-09-14). The
                    meta block is one short line against a text block that runs
                    to two or three, so pinning it to the top left it floating
                    against the first line with nothing beside the rest. Centred,
                    the score and the button read as belonging to the whole
                    row. */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* `flex-1`, not `min-w-0` alone. Without it the text block
                      sizes to its content, and a summary longer than the row
                      claims the whole width — which pushes the score and the
                      delete button onto a second line at the LEFT. The
                      median summary is 190 characters, so that was the normal
                      row, not the long one, and the skeleton beside it draws
                      them on the right. */}
                  <div className="min-w-0 flex-1">
                    {/* 16px, and the item number in ink beside it (owner,
                        2026-09-14). The number was `--muted-foreground`, which
                        §4 keeps for meta — a count, a row number, a hint. This
                        one is not meta: «4.1» is how the положення names the
                        indicator, and it is what somebody checking their own
                        record against the printed table matches on. */}
                    <p className="text-base">
                      <span className="mr-1.5">{item.itemNumber}</span>
                      {item.label}
                    </p>
                    {/* **Not `truncate`** (2026-09-11). It was clamped to one
                        line with an ellipsis, and measured against 4000 real
                        activities that hid most of nearly every row: the median
                        evidence summary is 190 characters, 56% run past 120 and
                        the longest is 1293. A row read «Квартиль: Q1 ·
                        Бібліографічний опис: Шевченко О. П. Цифро…», which is
                        not enough to tell one publication from another — and
                        telling them apart is the whole reason the line is
                        there. Wrapping is what a list can afford and a table
                        column cannot. */}
                    {item.summary && (
                      // 14px and `--foreground-soft` (owner, 2026-09-14), up
                      // from 12px `--muted-foreground`. This line is the only
                      // thing telling two rows of the same indicator apart —
                      // which conference, which publication — so it was a size
                      // too small and a step too faint for what it carries.
                      <p className="mt-0.5 text-sm text-foreground-soft">{item.summary}</p>
                    )}
                    {item.status === 'REMOVED' && item.removeReason && (
                      <p className="mt-1 text-xs text-error">
                        Причина відхилення: {item.removeReason}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Same rule as the rating table: «Зараховано» on every row
                        says nothing and buries the one «Відхилено», which is
                        the only state an НПП has to do something about. */}
                    {item.status !== 'APPROVED' && (
                      <Badge tone={STATUS_TONE[item.status]}>{item.statusLabel}</Badge>
                    )}
                    {/* **«Бали:», and no date** (owner, 2026-09-14). The date
                        was `createdAt` — the day the row was TYPED, not when
                        the work happened — and several indicators carry a real
                        «Дата» of their own that already shows in the details
                        line, so the two could contradict each other. A closed
                        year never had it either (`snapshotToGroups` writes an
                        empty string), so dropping it also makes an open year
                        and a closed one draw the same row.

                        The word earns its place where the date's did not: a
                        bare figure at the end of a row could be a count, a
                        year or a page number. */}
                    <span className="text-sm text-foreground-soft">
                      Бали:{' '}
                      <span
                        className={cn(
                          // 16px: the score is the one value on the row
                          // somebody actually goes looking for.
                          'text-base font-semibold text-foreground tabular-nums',
                          item.status === 'REMOVED' && 'text-muted-foreground line-through'
                        )}
                      >
                        {item.score.toLocaleString('uk-UA')}
                      </span>
                    </span>
                    {item.canDelete && (
                      <DeleteActivityButton activityId={item.id} label={item.label} />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

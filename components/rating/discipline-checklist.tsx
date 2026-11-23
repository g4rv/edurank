import { Check, Circle, TriangleAlert } from 'lucide-react';
import { progressText } from '@/lib/disciplines/assigned';
import type { DisciplineItem } from '@/lib/rating/rating-gate';

/**
 * The disciplines the departments assigned to this НПП for the year, with which
 * of them 5.1 already answers (owner, 2026-11-19). It is on Розділ 5 and says,
 * while any is left, what the close of the year will do. A status, so it
 * carries the warning / success tokens (§3 of docs/aurora.md). Nothing here
 * blocks anything — the year is judged when it closes.
 */
export function DisciplineChecklist({
  items,
  ofOther = false,
}: {
  items: DisciplineItem[];
  /** An admin or editor reading somebody else's rating: the wording speaks of «they» */
  ofOther?: boolean;
}) {
  if (items.length === 0) return null;
  const done = items.filter((i) => i.done).length;
  const complete = done === items.length;

  return (
    <section
      aria-label="Дисципліни для пункту 5.1"
      className={`rounded-lg border px-4 py-3 ${complete ? 'bg-success-surface' : 'bg-warning-surface'}`}
    >
      <p
        className={`flex items-start gap-2 font-medium ${complete ? 'text-success' : 'text-warning'}`}
      >
        {complete ? (
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
        ) : (
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        {complete
          ? `Усі дисципліни заповнено (${progressText(done, items.length)})`
          : ofOther
            ? `Заповнено ${progressText(done, items.length)} дисциплін. Якщо до закриття рейтингового року не буде запису для кожної, бали за всі інші пункти не буде зараховано.`
            : `Заповнено ${progressText(done, items.length)} дисциплін. Додайте запис для кожної: якщо цього не зроблено до закриття рейтингового року, бали за всі інші пункти не буде зараховано.`}
      </p>
      <ul className="mt-2 space-y-1">
        {items.map((i) => (
          <li key={i.name} className="flex items-start gap-2 text-sm">
            {i.done ? (
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            )}
            <span>
              {i.name}
              {i.done && i.notLecturer && (
                <span className="text-muted-foreground"> — не лектор</span>
              )}
              {!i.done && <span className="text-warning"> — немає запису</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

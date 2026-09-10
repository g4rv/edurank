import { Card } from '@/components/aurora/ui/card';

/**
 * The page's title and what it is for, on a card.
 *
 * **A card, like the profile's identity band** (owner, 2026-09-10). A bare
 * heading on the wash left the page starting with loose text above a row of
 * cards, so the first thing on screen was the one thing not sitting on a
 * surface. §1: when something needs to stand out, make it a card.
 *
 * Its own component because the `loading.tsx` renders it too — it is static
 * text that never depended on a query, so it is printed rather than
 * approximated, the same rule the record tabs follow. Only the year is unknown,
 * and only for the half-second before the template answers.
 *
 * «Обирати можна з-поміж усіх зарахованих» is the sentence that matters. An НПП
 * may recruit onto any programme in the university, and the picker below does
 * not filter to their own кафедра — without saying so, somebody whose student
 * went elsewhere would assume the list was broken and stop.
 */
export function StudentsHeader({ year }: { year?: number }) {
  return (
    <Card padding="compact">
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">Мої залучені здобувачі</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        {/* The year holds its own width while it loads, so the sentence does
            not reflow around it when the template answers. */}
        Вступники {year ?? <span className="opacity-0">0000</span>} року, яких ви залучили. Обирати
        можна з-поміж усіх зарахованих до університету — не лише тих, хто вступив на спеціальності
        вашої кафедри.
      </p>
    </Card>
  );
}

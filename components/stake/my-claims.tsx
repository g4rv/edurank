import { Card, EmptyState } from '@/components/aurora/ui/card';
import { cn } from '@/lib/utils';
import { formatBonus } from '@/lib/stake/units';
import { UK } from '@/lib/plural';
import type { MyClaim } from '@/lib/queries/list-student-claims';
import type { RegisterSpeciality } from '@/lib/students/accepted';
import { AddClaimForm } from './add-claim-form';
import { ClaimsTable } from './claims-table';

/**
 * «Мої залучені здобувачі» — the two figures, the form and the list.
 *
 * **A server component since 2026-09-10.** It was `'use client'` and 628 lines:
 * the cascade form, the table and this composition in one file, so the whole
 * thing shipped to the browser to render two figures and a heading. The form is
 * `add-claim-form.tsx` and the table is `claims-table.tsx` — both still client,
 * both only what genuinely needs to be.
 *
 * The person is **never told about a conflict**. If a colleague has claimed the
 * same student, nothing here says so and nothing is blocked — the duplicate is
 * shown on the review screen, to the ADMIN who rules on it and to the head who
 * reads it. Blocking or warning would hand the ставка to whoever typed first
 * rather than to whoever did the work.
 *
 * That is why the total is labelled as POSSIBLE. It is what these students
 * would be worth if every claim is confirmed, and some of them may not be.
 */
export function MyClaims({
  claims,
  potential,
  potentialCount,
  confirmed,
  confirmedCount,
  register,
  year,
  canAdd,
  addBlockedReason,
}: {
  claims: MyClaim[];
  potential: number;
  potentialCount: number;
  confirmed: number;
  confirmedCount: number;
  /** The admitted-students register, as a спеціальність → спеціалізація → умови tree */
  register: RegisterSpeciality[];
  year: number;
  /** False once the rating year is closed, or before the register is imported */
  canAdd: boolean;
  /** Why adding is closed, shown in place of the form */
  addBlockedReason?: string;
}) {
  return (
    // **A height budget, not a stretch.** The column is bounded (the page is
    // `h-full` inside the shell's `h-screen` main), the figures and the form
    // are `shrink-0`, and the table is the one item allowed to shrink — so it
    // is its own content's height on a short list and exactly what is left on a
    // long one. Nothing stretches to fill; the page simply never grows past one
    // screen.
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {/* **The figures stack in a narrow column beside the form** (owner,
          2026-09-10). Across the full width they were two half-page cards
          holding a five-character number each, with a tall form underneath —
          so the page was long and most of it was empty. A ставка figure needs
          very little room; the form needs all it can get.

          `xl` and not `lg`: below that the form's own grid puts «Спеціальність»
          and «Спеціалізація» side by side, and squeezing that into two thirds
          of a 1024px window truncates two long programme names at once. Under
          `xl` everything stacks, which is also the phone layout. */}
      <div className="grid shrink-0 gap-5 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          {/* Two cards, not two figures in one. They are different quantities —
              everything filed against the part agreed — and inside one card
              they read as a single reading split in two. Each also carries HOW
              MANY people it is made of, which is the question anybody asks of a
              ставка figure they cannot check in their head. */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Figure
              value={formatBonus(potential)}
              label="Усього за заявками"
              count={potentialCount}
            />
            <Figure
              value={formatBonus(confirmed)}
              label="Підтверджено"
              count={confirmedCount}
              className="text-green-700 dark:text-green-400"
            />
          </div>

          {/* What this page may and may not promise (2026-08-17). Recruitment
              is settled in a SECOND phase, months after the main розподіл: the
              проректор raises the кафедра's pool and the завідувач hands out
              the increase by hand. So a confirmed здобувач is an argument, not
              an amount owed — somebody with no room may get nothing, and that
              is a conversation, not a calculation. The page said «виплачується
              понад виділені кафедрі ставки» until then, which promised money
              the grid never paid.

              Under the two figures and inside their column: it explains both of
              them, so it cannot go inside either card without attaching itself
              to one — and here it fills the height left beside a tall form
              instead of pushing the form further down the page. */}
          <p className="text-xs text-muted-foreground">
            Спершу адміністратор підтверджує здобувача. Підтверджені здобувачі враховуються на
            <strong className="font-medium"> 2 етапі розподілу ставок</strong>, який відбувається
            пізніше — рішення про надбавку ухвалює завідувач разом з адміністрацією.
          </p>
        </div>

        {/* **Open on the page, not behind a button** (owner, 2026-09-10,
            reversing the same day's move into a sheet). Fewer steps wins here:
            the whole job of this screen is adding somebody, and a click that
            only reveals the form is a step which decides nothing. When adding
            is closed the card stays and says why, so the shape of the page does
            not change under somebody who used it last week. */}
        {canAdd ? (
          <AddClaimForm register={register} year={year} />
        ) : (
          addBlockedReason && (
            <Card title={`Додати здобувача — ${year}`}>
              <p className="text-sm text-muted-foreground">{addBlockedReason}</p>
            </Card>
          )
        )}
      </div>

      {claims.length === 0 ? (
        // No «Додати» action here: the form itself is directly above, open. An
        // offer to fix the emptiness that scrolls you back up to what you can
        // already see is not an offer.
        <EmptyState>Ви ще не додали жодного здобувача за цей рік.</EmptyState>
      ) : (
        <ClaimsTable claims={claims} canDelete={canAdd} />
      )}
    </div>
  );
}

/**
 * One figure, its name, and how many people are behind it.
 *
 * `tabular-nums` because the two sit side by side and a proportional «1» would
 * make «0,095» and «0,195» different widths.
 *
 * The count and the figure are derived from ONE filter in `listMyClaims`, not
 * two here — a card reading «0,190» over «3 здобувачі» is worse than no count
 * at all, and that is exactly what two separate predicates drift into.
 */
export function Figure({
  value,
  label,
  count,
  className,
}: {
  value: string;
  label: string;
  count: number;
  className?: string;
}) {
  return (
    <Card padding="compact">
      <p className={cn('text-2xl font-semibold tabular-nums', className)}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {label} · {UK.student(count)}
      </p>
    </Card>
  );
}

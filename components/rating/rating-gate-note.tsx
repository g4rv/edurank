import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { EmptyState } from '@/components/aurora/ui/card';
import { ratingGateDetail, type GatingType } from '@/lib/rating/rating-gate';

/**
 * What a rating section shows until 5.1 is filled (owner, 2026-10-16) — in
 * place of the list and the «Додати» form, with the way to 5.1 beside it. The
 * sibling of `PlanGateNote`, which comes first: the science plan, then 5.1,
 * then the rest.
 */
export function RatingGateNote({ missing }: { missing: GatingType[] }) {
  const first = missing[0];
  return (
    <EmptyState
      action={
        <Button asChild>
          <Link href={`/achievements/${first.sectionNumber}`}>
            Перейти до п. {first.itemNumber}
            <ArrowRight />
          </Link>
        </Button>
      }
    >
      <p className="font-medium text-foreground">{ratingGateDetail(missing)}</p>
      <p className="mx-auto mt-1.5 max-w-md">
        Доки його не заповнено, сума вашого рейтингу рахується як 0.
      </p>
    </EmptyState>
  );
}

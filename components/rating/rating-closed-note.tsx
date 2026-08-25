import { AnimatedPage } from '@/components/ui/animated-page';
import { NPP_RATING_CLOSED_DETAIL, NPP_RATING_CLOSED_NOTE } from '@/lib/rating/npp-access';

/**
 * What an НПП sees where their rating or Характеристика used to be, while
 * `NPP_RATING_OPEN` is false.
 *
 * It keeps the page's own heading, so somebody who followed a link or a
 * bookmark lands where they expected and reads why it is empty — rather than
 * being redirected to /profile with nothing said, which reads as a fault.
 */
export function RatingClosedNote({ title }: { title: string }) {
  return (
    <AnimatedPage className="space-y-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="rounded-xl border bg-card px-6 py-12 text-center">
        <p className="font-medium">{NPP_RATING_CLOSED_NOTE}</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
          {NPP_RATING_CLOSED_DETAIL}
        </p>
      </div>
    </AnimatedPage>
  );
}

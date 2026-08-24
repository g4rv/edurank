import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedPage } from '@/components/ui/animated-page';

/**
 * The 404 a signed-in person sees — inside the dashboard shell, so the sidebar
 * stays put and a wrong address does not look like the app falling over.
 *
 * Reached both by a mistyped URL and by `notFound()` in a page whose record is
 * gone: an archived person's link from an old email, a кафедра somebody
 * deleted. So it offers a way back rather than only stating the problem.
 */
export default function DashboardNotFound() {
  return (
    <AnimatedPage className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <FileQuestion className="size-10 text-muted-foreground/40" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Сторінку не знайдено</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Можливо, адресу введено з помилкою, або запис, на який вона вела, вже видалено чи
          архівовано.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">На головну</Link>
      </Button>
    </AnimatedPage>
  );
}

import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * The 404 for anything outside the dashboard shell — a mistyped `/login`, a
 * dead link in an old invitation mail, a bookmarked route that has moved.
 *
 * Deliberately says nothing about whether the address exists. A page that
 * distinguished «немає такої сторінки» from «вам сюди не можна» would let
 * somebody map the app by trying URLs, and this one is reachable without
 * signing in.
 *
 * `(dashboard)/not-found.tsx` handles the signed-in case, where the sidebar is
 * already on screen and losing it would look like a crash rather than a wrong
 * address.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <p className="text-6xl font-semibold text-muted-foreground/40 tabular-nums">404</p>
        <h1 className="text-2xl font-semibold">Сторінку не знайдено</h1>
        <p className="text-sm text-muted-foreground">
          Можливо, адресу введено з помилкою або сторінку перенесено.
        </p>
      </div>
      <Button asChild>
        <Link href="/">На головну</Link>
      </Button>
    </main>
  );
}

import Link from 'next/link';
import { AuroraButton } from '@/components/aurora/ui/button';
import { AuroraWash } from '@/components/ui/aurora-wash';

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
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <AuroraWash />
      <div className="glass w-full max-w-sm rounded-2xl px-6 py-8 text-center">
        {/* The figure carries the brand rather than a flat grey: it is the one
            piece of colour on a page that is otherwise an apology, and it keeps
            this screen in the same family as the login it usually follows. */}
        <p className="text-6xl font-semibold text-brand/70 tabular-nums">404</p>
        <h1 className="mt-3 text-2xl font-semibold">Сторінку не знайдено</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Можливо, адресу введено з помилкою або сторінку перенесено.
        </p>
        <AuroraButton asChild size="xl" className="mt-6">
          <Link href="/">На головну</Link>
        </AuroraButton>
      </div>
    </main>
  );
}

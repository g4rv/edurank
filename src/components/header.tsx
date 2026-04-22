import { auth, signOut } from '@/auth';
import { Button } from '@/components/ui';
import Link from 'next/link';

export async function Header() {
  const session = await auth();

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-8">
        {/* Project name */}
        <Link
          href="/"
          className="text-xl font-semibold text-zinc-900 hover:text-zinc-700"
        >
          EduRank
        </Link>

        {/* Navigation - only if logged in */}
        {session && (
          <div className="flex items-center gap-6">
            {/* Navigation links based on role */}
            <nav className="flex items-center gap-4">
              <Link
                href="/professors"
                className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
              >
                Викладачі
              </Link>

              {session.user.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
                >
                  Адміністрування
                </Link>
              )}
            </nav>

            {/* User info */}
            <div className="flex items-center gap-4 border-l border-zinc-200 pl-6">
              <div className="text-right">
                <p className="text-sm font-medium text-zinc-900">
                  {session.user.email}
                </p>
                <p className="text-xs text-zinc-500">
                  {session.user.role === 'ADMIN' && 'Адміністратор'}
                  {session.user.role === 'EDITOR' && 'Редактор'}
                  {session.user.role === 'USER' && 'Користувач'}
                </p>
              </div>

              {/* Logout */}
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/login' });
                }}
              >
                <Button variant="ghost" size="sm" type="submit">
                  Вийти
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

import { auth, signOut } from '@/auth';
import { Container, Button } from '@/components/ui';
import { NavLinks } from '@/components/nav-links';
import Link from 'next/link';

export async function Header() {
  const session = await auth();
  const role = session?.user.role;

  const navLinks = [
    ...(role === 'ADMIN' || role === 'EDITOR'
      ? [
          { href: '/professors', label: 'Викладачі' },
          { href: '/faculties', label: 'Факультети' },
          { href: '/departments', label: 'Кафедри' },
        ]
      : []),
    ...(role === 'ADMIN' ? [{ href: '/divisions', label: 'Відділи' }] : []),
  ];

  return (
    <header className="border-b border-zinc-200 bg-white">
      <Container className="flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-xl font-semibold text-zinc-900 hover:text-zinc-700"
          >
            EduRank
          </Link>

          {navLinks.length > 0 && <NavLinks links={navLinks} />}
        </div>

        {session && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-zinc-900">
                {session.user.email}
              </p>
              <p className="text-xs text-zinc-400">
                {role === 'ADMIN' && 'Адміністратор'}
                {role === 'EDITOR' && 'Редактор'}
                {role === 'USER' && 'Користувач'}
              </p>
            </div>

            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <Button variant="secondary" size="sm" type="submit">
                Вийти
              </Button>
            </form>
          </div>
        )}
      </Container>
    </header>
  );
}

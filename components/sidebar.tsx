'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  GraduationCap,
  Building2,
  BookOpen,
  ShieldCheck,
  UserCog,
  ClipboardList,
  KeyRound,
  LogOut,
  LayoutDashboard,
  Award,
  Plus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/app/(dashboard)/actions';
import { SECTION_TITLES } from '@/lib/rating/activity-types';
import type { Role } from '@/lib/generated/prisma/client';

const RATING_SECTIONS = [1, 2, 3, 4, 5];

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: Role[];
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/staff', label: 'Персонал', icon: Users, roles: ['ADMIN', 'EDITOR'] },
  { href: '/faculties', label: 'Факультети', icon: GraduationCap, roles: ['ADMIN', 'EDITOR'] },
  { href: '/departments', label: 'Кафедри', icon: BookOpen, roles: ['ADMIN', 'EDITOR'] },
  { href: '/divisions', label: 'Відділи', icon: Building2, roles: ['ADMIN', 'EDITOR'] },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/admin/users', label: 'Користувачі', icon: UserCog, roles: ['ADMIN'] },
  { href: '/admin/permissions/field', label: 'Поля доступу', icon: KeyRound, roles: ['ADMIN'] },
  { href: '/admin/permissions/entity', label: 'Дії доступу', icon: ShieldCheck, roles: ['ADMIN'] },
  { href: '/admin/audit-log', label: 'Журнал аудиту', icon: ClipboardList, roles: ['ADMIN'] },
];

interface SidebarProps {
  user: {
    email: string;
    role: Role;
    staffId?: string | null;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  const mainNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const adminNav = user.role === 'ADMIN' ? ADMIN_NAV_ITEMS : [];

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-base font-semibold tracking-tight">EduRank</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
        {user.staffId && (
          <NavLink
            item={{
              href: '/profile',
              label: 'Мій профіль',
              icon: LayoutDashboard,
              roles: [user.role],
            }}
            pathname={pathname}
          />
        )}
        {user.role === 'USER' && (
          <>
            <NavLink
              item={{
                href: '/achievements',
                label: 'Мій рейтинг',
                icon: Award,
                roles: [user.role],
                exact: true,
              }}
              pathname={pathname}
            />
            <AddActivityNav pathname={pathname} />
          </>
        )}

        {adminNav.length > 0 && (
          <>
            <div className="mx-2 my-1 border-t" />
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Адміністрування</p>
            {adminNav.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </>
        )}
      </nav>

      <div className="border-t p-3">
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        <form action={signOutAction} className="mt-2">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" />
            Вийти
          </Button>
        </form>
      </div>
    </aside>
  );
}

function AddActivityNav({ pathname }: { pathname: string }) {
  const isOnSectionRoute = RATING_SECTIONS.some((s) => pathname === `/achievements/${s}`);
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const expanded = isOnSectionRoute || manuallyOpen;

  return (
    <div>
      <button
        type="button"
        onClick={() => setManuallyOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
          'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        )}
      >
        <Plus className="size-4 shrink-0" />
        Додати активність
        {expanded ? (
          <ChevronDown className="ml-auto size-4 shrink-0" />
        ) : (
          <ChevronRight className="ml-auto size-4 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-0.5 ml-3.5 flex flex-col gap-0.5 border-l pl-2.5">
          {RATING_SECTIONS.map((section) => {
            const href = `/achievements/${section}`;
            const isActive = pathname === href;
            return (
              <Link
                key={section}
                href={href}
                title={SECTION_TITLES[section]}
                className={cn(
                  'rounded-md px-2 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                Розділ {section}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  // Exact match for /achievements (My Rating) so section routes don't also highlight it
  const isActive = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + '/');
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      )}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}

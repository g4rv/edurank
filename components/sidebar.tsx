'use client';

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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/app/(dashboard)/actions';
import type { Role } from '@/lib/generated/prisma/client';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/staff', label: 'Персонал', icon: Users, roles: ['ADMIN', 'EDITOR'] },
  { href: '/faculties', label: 'Факультети', icon: GraduationCap, roles: ['ADMIN', 'EDITOR'] },
  { href: '/departments', label: 'Кафедри', icon: BookOpen, roles: ['ADMIN', 'EDITOR'] },
  { href: '/divisions', label: 'Відділи', icon: Building2, roles: ['ADMIN', 'EDITOR'] },
  { href: '/profile', label: 'Мій профіль', icon: LayoutDashboard, roles: ['USER'] },
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

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
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

'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  GraduationCap,
  Building2,
  BookOpen,
  ShieldCheck,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  Award,
  BadgeCheck,
  Table2,
  Trophy,
  CalendarCog,
  ChartColumn,
  Scale,
  FileCheck,
  MailPlus,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { SECTION_TITLES } from '@/lib/rating/activity-types';
import {
  NPP_RATING_CLOSED_NAV_NOTE,
  NPP_RATING_CLOSED_NOTE,
  NPP_RATING_OPEN,
} from '@/lib/rating/npp-access';
import type { Role } from '@/lib/generated/prisma/client';

const RATING_SECTIONS = [1, 2, 3, 4, 5];

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /** Exact match — /achievements must not light up on /achievements/3 */
  exact?: boolean;
  /**
   * Shown, greyed, and not a link. Only `NPP_RATING_OPEN` uses this: a person
   * who had «Мій рейтинг» yesterday should see that it is still theirs and
   * temporarily shut, rather than find the line silently gone and assume their
   * account lost something.
   */
  disabled?: boolean;
}

/**
 * ADMIN and nobody else. Settings for the system rather than work on people:
 * which year is open, who may edit what, who has been invited, what was changed.
 *
 * «Відділи» sits here rather than beside Кафедри/Факультети, which is where it
 * looks like it belongs. A відділ carries the permission rows — an editor who
 * could touch one would be granting themselves rights — so its audience is a
 * different one from the rest of the structure, and this list is grouped by
 * audience.
 */
const ADMINISTRATION_NAV: NavItem[] = [
  { href: '/divisions', label: 'Відділи', icon: Building2 },
  { href: '/admin/rating', label: 'Рейтингові роки', icon: CalendarCog },
  { href: '/admin/permissions/field', label: 'Поля доступу', icon: KeyRound },
  { href: '/admin/permissions/entity', label: 'Дії доступу', icon: ShieldCheck },
  { href: '/admin/invites', label: 'Запрошення', icon: MailPlus },
  { href: '/admin/students', label: 'Здобувачі', icon: GraduationCap },
  { href: '/admin/audit-log', label: 'Журнал аудиту', icon: ClipboardList },
];

interface SidebarProps {
  user: {
    email: string;
    role: Role;
    staffId?: string | null;
  };
  /** Fresh from DB (layout), not the session token — admin can flip the staff type mid-session */
  isNpp?: boolean;
  canModerate?: boolean;
  canEnterData?: boolean;
  /** Heads a кафедра or a факультет — derived from headId/deanId, never a Role */
  headsDepartment?: boolean;
}

/**
 * Three groups, split by WHOSE data a screen is about (owner, 2026-08-17).
 *
 * The old sidebar grouped by subject — structure, then data entry, then rating —
 * and the same person's own record was scattered through it. One person routinely
 * wears three hats here: a проректор who lectures is an ADMIN, an НПП and often a
 * завідувач, and they need to know at a glance which hat a link belongs to.
 *
 * - **Особисте** — their own record. Nobody else can see any of it.
 * - **Управління** — other people's records. ADMIN, a завідувач/декан, a division
 *   editor; who sees which line still depends on their rights.
 * - **Адміністрування** — the system itself. ADMIN only.
 *
 * Headings appear only when more than one group is present, so an ordinary НПП
 * still sees a plain list rather than one heading over their whole sidebar.
 */
export function Sidebar({
  user,
  isNpp = false,
  canModerate = false,
  canEnterData = false,
  headsDepartment = false,
}: SidebarProps) {
  const pathname = usePathname();

  const isAdmin = user.role === 'ADMIN';
  // View access to other people's ratings and to the structure lists
  const canSeeRating = isAdmin || user.role === 'EDITOR';

  // ── Особисте ───────────────────────────────────────────────────────────────
  // A person's own record, and the only place they are the subject rather than
  // the operator. `isNpp` opens the rating half — NOT the USER role, because an
  // ADMIN or EDITOR who also lectures has a rating like everybody else.
  const personal: NavItem[] = [];
  if (user.staffId) {
    personal.push({ href: '/profile', label: 'Мій профіль', icon: LayoutDashboard });
  }
  if (isNpp) {
    personal.push(
      // Both greyed while `NPP_RATING_OPEN` is false; «Мої здобувачі» is not,
      // because claiming a recruited здобувач is not rating data and goes on.
      {
        href: '/achievements',
        label: 'Мій рейтинг',
        icon: Award,
        exact: true,
        disabled: !NPP_RATING_OPEN,
      },
      {
        href: '/achievements/kharakterystyka',
        label: 'Характеристика',
        icon: FileCheck,
        disabled: !NPP_RATING_OPEN,
      },
      // «Мої», because a завідувач who also lectures gets the review screen under
      // «Залучені здобувачі» below, and two identical labels is a coin toss.
      { href: '/achievements/students', label: 'Мої здобувачі', icon: UserPlus }
    );
  }

  // ── Управління ─────────────────────────────────────────────────────────────
  // Other people's records. Ordered structure → operations → rating, and every
  // line is still gated on its own right: a завідувач who is an ordinary USER
  // sees three of these, an ADMIN sees all of them.
  const management: NavItem[] = [];
  if (headsDepartment) {
    // Exact — otherwise /my-department/students lights both lines at once
    management.push({ href: '/my-department', label: 'Моя кафедра', icon: BookOpen, exact: true });
  }
  if (canSeeRating) {
    management.push(
      { href: '/staff', label: 'Персонал', icon: Users },
      { href: '/departments', label: 'Кафедри', icon: BookOpen },
      { href: '/faculties', label: 'Факультети', icon: GraduationCap }
    );
  }
  if (headsDepartment || isAdmin) {
    management.push(
      { href: '/my-department/students', label: 'Залучені здобувачі', icon: UserPlus },
      // One entry for everyone who may open it. It used to be listed twice —
      // once under «Адміністрування» and once for heads — which gave an ADMIN
      // heading a кафедра the same link in two places.
      { href: '/stakes', label: 'Розподіл ставок', icon: Scale }
    );
  }
  if (canEnterData) {
    management.push({ href: '/division-data', label: 'Дані відділу', icon: Table2 });
  }
  if (canSeeRating) {
    management.push({ href: '/rating', label: 'Рейтинг НПП', icon: Trophy });
  }
  if (canModerate) {
    management.push({ href: '/moderation', label: 'Модерація рейтингу', icon: BadgeCheck });
  }
  if (canSeeRating) {
    management.push({ href: '/dashboard', label: 'Графіки', icon: ChartColumn });
  }

  // ── Адміністрування ────────────────────────────────────────────────────────
  const administration: NavItem[] = isAdmin ? ADMINISTRATION_NAV : [];

  const sections = [
    // «Додати активність» is the submission half and goes away entirely while
    // the rating is closed — five more dead links say nothing the greyed
    // «Мій рейтинг» above has not already said.
    {
      label: 'Особисте',
      items: personal,
      showSections: isNpp && NPP_RATING_OPEN,
      note: isNpp && !NPP_RATING_OPEN ? NPP_RATING_CLOSED_NAV_NOTE : null,
    },
    { label: 'Управління', items: management, showSections: false, note: null },
    { label: 'Адміністрування', items: administration, showSections: false, note: null },
  ].filter((s) => s.items.length > 0);

  const showHeadings = sections.length > 1;

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <span className="text-base font-semibold tracking-tight">EduRank</span>
        <ThemeToggle className="-mr-1.5 ml-auto" />
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {sections.map((section, i) => (
          <Fragment key={section.label}>
            {i > 0 && <div className="mx-2 my-1 border-t" />}
            {/* Uppercase, like the card titles on every page, so a group heading
                reads as a tier above «Додати активність» nested inside this one.
                Both were the same style and the sub-heading looked like a
                fourth group. */}
            {showHeadings && (
              <p className="px-2 py-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {section.label}
              </p>
            )}
            {section.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
            {section.showSections && <AddActivityNav pathname={pathname} />}
            {section.note && (
              <p className="px-2 pt-1 pb-1 text-[11px] leading-snug text-muted-foreground">
                {section.note}
              </p>
            )}
          </Fragment>
        ))}
      </nav>

      <div className="border-t p-3">
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        <div className="mt-2">
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

// Always open: five links are short enough to show outright, and a collapsed
// group hid the only route an НПП uses to submit anything.
function AddActivityNav({ pathname }: { pathname: string }) {
  return (
    <div className="mt-1">
      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Додати активність</p>

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
    </div>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  // Exact match for /achievements (My Rating) so section routes don't also highlight it
  const isActive = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + '/');
  const Icon = item.icon;

  // A span, not a styled `<Link>`: `pointer-events-none` still leaves the route
  // in the DOM for a prefetch and for anything that walks links, and this one
  // must not be followed at all.
  if (item.disabled) {
    return (
      <span
        title={NPP_RATING_CLOSED_NOTE}
        aria-disabled
        className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground/60"
      >
        <Icon className="size-4 shrink-0" />
        {item.label}
      </span>
    );
  }

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

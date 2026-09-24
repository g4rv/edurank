'use client';

import { Logo } from '@/components/aurora/logo';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import type { Role } from '@/lib/generated/prisma/client';
import { SECTION_TITLES } from '@/lib/rating/activity-types';
import { NPP_RATING_CLOSED_NOTE, NPP_RATING_OPEN } from '@/lib/rating/npp-access';
import type { SectionTotals } from '@/lib/rating/section-scores';
import { cn } from '@/lib/utils';
import {
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarCog,
  ChartColumn,
  ClipboardList,
  FlaskConical,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  MailPlus,
  Scale,
  ShieldCheck,
  Table2,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

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
  { href: '/admin/science-plan', label: 'Планування науки', icon: FlaskConical },
  { href: '/admin/permissions/field', label: 'Поля доступу', icon: KeyRound },
  { href: '/admin/permissions/entity', label: 'Дії доступу', icon: ShieldCheck },
  { href: '/admin/invites', label: 'Запрошення', icon: MailPlus },
  { href: '/admin/students', label: 'Здобувачі', icon: GraduationCap },
  { href: '/admin/audit-log', label: 'Журнал аудиту', icon: ClipboardList },
];

export interface SidebarProps {
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
  /**
   * Декан of a факультет. Their own screen is «Мій факультет» in place of
   * «Моя кафедра» — a декан is never also a завідувач (`headDeanConflict`).
   */
  isDean?: boolean;
  /** ADMIN, or exactly ННВ's editors (registryKey, never the moderation flag) */
  canOverseeSciencePlans?: boolean;
  /**
   * The open year's score per section, for the rating group. `null` when the
   * person has no entry yet — five zeros would read as a counted record of
   * nothing rather than as nothing submitted (see `sectionScores`).
   */
  ratingTotals?: SectionTotals | null;
  /**
   * Which рік these five sections belong to. Somebody filling their rating in
   * September is a year behind what the calendar says, and the group gave no
   * sign of which one it was counting.
   */
  ratingYear?: number | null;
  /**
   * Rendered inside the phone drawer rather than as the rail.
   *
   * The nav itself is identical — same links, same order, same active state —
   * so this only drops the parts that belong to the RAIL: its own width, the
   * full-height frame, the border it shares with the page, and the header row,
   * because the drawer already sits under a top bar carrying the logo.
   */
  inDrawer?: boolean;
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
  isDean = false,
  canOverseeSciencePlans = false,
  ratingTotals = null,
  ratingYear = null,
  inDrawer = false,
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
    // **«Мій рейтинг» and «Характеристика» are NOT here** (owner, 2026-09-09).
    // They are tabs of «Мій профіль» now, at `/profile/rating` and
    // `/profile/kharakterystyka` — the same three tabs somebody else's record
    // has. As sidebar items they made a person's own record three unrelated
    // pages while every other person's was one record with three tabs.
    //
    // The greyed-while-frozen treatment moved with them: `ProfileTabRow` greys
    // the two tabs and prints the same sentence under the row.
    personal.push(
      // «Мої», because a завідувач who also lectures gets the review screen under
      // «Залучені здобувачі» below, and two identical labels is a coin toss.
      { href: '/achievements/students', label: 'Мої здобувачі', icon: UserPlus },
      // Own row per Додаток III, not a rating tab: D3 keeps the plan fully
      // separate from «Мій рейтинг» — two measuring systems over one world.
      { href: '/science-plan', label: 'Наукова робота', icon: FlaskConical }
    );
  }

  // ── Управління ─────────────────────────────────────────────────────────────
  // Other people's records. Ordered structure → operations → rating, and every
  // line is still gated on its own right: a завідувач who is an ordinary USER
  // sees three of these, an ADMIN sees all of them.
  const management: NavItem[] = [];
  if (isDean) {
    management.push({ href: '/my-faculty', label: 'Мій факультет', icon: GraduationCap });
  } else if (headsDepartment) {
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
  // Not for a декан (owner, 2026-09-24): «Мій факультет» is information about
  // their кафедри and staff, and nothing else — the students and the ставки
  // are the завідувач's work and ADMIN's.
  if ((headsDepartment && !isDean) || isAdmin) {
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
  if (canOverseeSciencePlans) {
    // Every кафедра's наукова робота plans — ADMIN and «Перевірка науки»
    // only (D43/D44). A завідувач and a декан have no science list.
    management.push({ href: '/science-plans', label: 'Плани наукової роботи', icon: FlaskConical });
  }
  // `/moderation` holds TWO post-checks — the rating's and наукова робота's —
  // each rendered on its own permission. Gating the link on `canModerate`
  // alone left a division granted science oversight and not the rating flag
  // with a page it was entitled to and no way to reach it but by typing the
  // URL. The label drops «рейтингу» for the same reason: the page stopped
  // being only that.
  if (canModerate || canOverseeSciencePlans) {
    management.push({ href: '/moderation', label: 'Модерація', icon: BadgeCheck });
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
    //
    // **No group carries a note any more** (2026-09-10). One did: «Рейтинг і
    // характеристика тимчасово недоступні», at the foot of «Особисте», under
    // the two greyed entries it explained. Those became profile tabs, and the
    // sentence was left standing over «Мій профіль» and «Мої здобувачі» — both
    // live — describing pages this group no longer lists. `ProfileTabRow` prints
    // it under the tabs it belongs to, so the field and its render branch went
    // rather than staying as a `null` nothing sets.
    { label: 'Особисте', items: personal, showSections: isNpp && NPP_RATING_OPEN },
    { label: 'Управління', items: management, showSections: false },
    { label: 'Адміністрування', items: administration, showSections: false },
  ].filter((s) => s.items.length > 0);

  const showHeadings = sections.length > 1;

  return (
    // Translucent, so the wash reads through it and the rail belongs to the page
    // instead of being a grey slab bolted to its edge. Deliberately unblurred —
    // see `.glass-chrome` in globals.css.
    //
    // **Every separator in here is `--border` now** (owner, 2026-09-21: «line
    // separators almost invisible at least on aside»). All six wore
    // `border-foreground/8`, which was the faintest line in the app at 1.18 on
    // the rail AND the only separator not painted in the border token — a
    // foreground tint, a different colour family, which §3 rules out for
    // exactly the reason it went unnoticed here. A bare `border-*` picks up
    // `--border` from the `*` rule in `@layer base`, so the class simply goes.
    //
    // shadcn shipped a whole `--sidebar-*` palette for this rail: a ground, a
    // foreground, an accent pair, a primary pair, a border and a ring. **All
    // eight are gone** (2026-09-21). Seven were never read by anything, and the
    // eighth — `--sidebar-foreground`, the one this file used — was
    // `oklch(0.145 0.012 264)` in light and `oklch(0.985 0 0)` in dark, which is
    // `--foreground` character for character in both themes. A second name for
    // ink, on the one surface in the app whose whole list should not be ink.
    <aside
      className={cn(
        'flex flex-col',
        inDrawer
          ? 'h-full w-full'
          : // **Gone below `md`, not narrowed.** At 400px the rail kept its
            // 224px and left the page 176px, so a heading wrapped one word to
            // a line. There is no width this is useful at on a phone — it is
            // the drawer's job there, and `NavDrawer` renders the same nav.
            'glass-chrome hidden h-screen w-56 shrink-0 border-r md:flex'
      )}
    >
      {/* The drawer has no header of its own: the top bar above it already
          carries the logo and the theme toggle, and `SheetContent` draws the
          close button. */}
      {!inDrawer && (
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Logo />
          <ThemeToggle className="-mr-1.5 ml-auto" />
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {sections.map((section, i) => (
          <Fragment key={section.label}>
            {i > 0 && <div className="mx-2 my-1 border-t" />}
            {/* Uppercase, like the card titles on every page, so a group heading
                reads as a tier above «Додати активність» nested inside this one.
                Both were the same style and the sub-heading looked like a
                fourth group. */}
            {showHeadings && (
              <p className="px-2 py-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {section.label}
              </p>
            )}
            {section.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
            {section.showSections && (
              <AddActivityNav pathname={pathname} totals={ratingTotals} year={ratingYear} />
            )}
          </Fragment>
        ))}
      </nav>

      {/* Who you are signed in as, and the one control that ends it — on one
          row (owner, 2026-09-21). The address used to sit above a full-width
          «Вийти», which made the sign-out read as the last NAV ITEM in the list
          rather than as something belonging to the account named over it.
          Opposite each other they are plainly one block about one person.

          **The ROLE is gone** (owner, 2026-09-22), reversing the second half of
          that day's decision. The argument for it was that an ADMIN who also
          lectures and an EDITOR look identical from the outside. The argument
          against is simpler and won: you know which role you have, and a word
          that never changes is a line of chrome charged to every screen. What
          somebody may do is answered by which nav items are in front of them,
          which is the same answer arriving without being asked for.

          It also bought the room the button needed for its own name — see
          `SignOutButton`. */}
      {/* **Two rows, and the address is never cut** (owner, 2026-09-22).
          Side by side, the labelled button left 113px and the address showed
          as «liudmyla.burdo…» — an account name you cannot read is not an
          account name.

          The sizes are measured, not chosen. 200px of room; at `text-sm` a
          typical address is 208–216px and the longest real one —
          `oksana.parkhomenko-kutsevil@uhsp.edu.ua`, 39 characters — is 292.
          No font size fits that: it is still 250px at 12px and 230 at 11,
          and §4 retired `text-[11px]` anyway. So the address must be allowed
          to WRAP, and 12px is the size at which wrapping becomes the exception
          — 179–185px puts the ordinary account on one line and leaves only a
          handful of long ones taking two.

          `wrap-anywhere` rather than `break-all`: it breaks only when the word
          genuinely cannot fit, so a short address is never split for no
          reason. */}
      <div className="flex flex-col gap-2 border-t px-3 py-4">
        {/* Ink, not `--foreground-soft`. §4 of `docs/aurora.md` keeps that
            token for prose that EXPLAINS; an address is a value, and this one
            names the account. */}
        <p className="text-xs font-medium wrap-anywhere">{user.email}</p>

        <SignOutButton />
      </div>
    </aside>
  );
}

// Always open: five links are short enough to show outright, and a collapsed
// group hid the only route an НПП uses to submit anything.
function AddActivityNav({
  pathname,
  totals,
  year,
}: {
  pathname: string;
  totals: SectionTotals | null;
  year: number | null;
}) {
  return (
    <div className="mt-1">
      {/* The YEAR fits here where the total did not (owner, 2026-09-21): four
          figures beside a 147px heading leave room in the 192px row, where a
          real total like 29 300 wrapped it onto two lines — see the note on
          «Разом» below. Somebody filling their rating in September is a year
          behind the calendar, and the group used to give no sign of which one
          it was counting. */}
      <p className="flex items-center gap-2 px-2 py-1 text-sm font-medium text-foreground">
        Заповнення рейтингу
        {year !== null && (
          <span className="ml-auto text-sm font-medium text-foreground">{year}</span>
        )}
      </p>

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
                  ? 'bg-brand/12 font-medium text-brand-strong'
                  : 'text-foreground hover:bg-foreground/6'
              )}
            >
              <span className="flex items-center gap-2">
                Розділ {section}
                {/* Grey and never brand, even on the active row: §3 keeps
                    chrome monochrome, and a coloured figure here would pull the
                    eye off the page it is meant to lead to. `tabular-nums` so
                    the five line up as a column rather than a ragged edge. */}
                {totals && (
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {totals.sections[section - 1].toLocaleString('uk-UA')}
                  </span>
                )}
              </span>
            </Link>
          );
        })}

        {/* **A row of its own, not on the heading** (owner, 2026-09-14). The
            total was tried beside «Заповнення рейтингу» and did not fit: the
            row is 192px and the heading alone needs 147, so even «1 320»
            wrapped it onto two lines — and a real total like 29 300 is wider
            still.

            Down here it also lands in the same column as the five, which is
            what `tabular-nums` is for: six figures reading as one column that
            adds up, rather than a label with a number stuck to its end.
            «Разом» is the word `RatingBars` already uses for this number. */}
        {totals && (
          <div className="mt-1 flex items-center gap-2 border-t px-2 pt-1.5 text-sm">
            <span className="font-medium">Разом</span>
            <span className="ml-auto font-medium tabular-nums">
              {totals.total.toLocaleString('uk-UA')}
            </span>
          </div>
        )}
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
          ? 'bg-brand/12 font-medium text-brand-strong'
          : 'text-foreground hover:bg-foreground/6'
      )}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}

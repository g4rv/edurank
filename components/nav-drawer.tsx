'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/aurora/ui/sheet';
import { Logo } from '@/components/aurora/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Sidebar, type SidebarProps } from '@/components/sidebar';

/**
 * The navigation on a phone — a top bar, and the rail in a drawer behind it.
 *
 * **Why it exists at all.** The shell had no breakpoint anywhere: one flex row,
 * a `w-56` rail and a `flex-1` main. At 400px that is 224px of rail against
 * 176px of page, so «Розділ 3. Показники науково-інноваційної діяльності»
 * wrapped to one word a line. Nothing was broken — a phone layout had simply
 * never been written.
 *
 * **It renders the same `Sidebar`.** Not a second copy of the nav: the links,
 * their order, which one is active and who may see each are decided in one
 * place, and `inDrawer` drops only the parts that belong to a rail. A separate
 * mobile nav is how one of them ends up missing a link after somebody adds it
 * to the other.
 *
 * **The drawer closes on navigation**, watched through `usePathname` rather
 * than handed down to every link. Threading an `onNavigate` through `Sidebar`
 * into `NavLink` would make the shared component care about the drawer, and it
 * would still miss anything that navigates another way — a redirect after a
 * save, the browser's back button.
 *
 * **`md`, not `sm`.** A tablet at 768px keeps the rail: 224px of a 768px screen
 * still leaves 544px, which is a form width. Below that it is not.
 */
export function NavDrawer(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Adjusted DURING RENDER, not in an effect. React documents this as the way
  // to reset state when a value changes — it re-renders immediately, before
  // anything is painted, so the drawer never shows itself open on the new
  // page. An effect would do it one commit later (and `react-hooks`
  // `set-state-in-effect` refuses it outright, for the cascading render).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <>
      {/* Matches the rail's own header height, so the two line up at the
          breakpoint instead of the page jumping by a few pixels. */}
      <header className="glass-chrome flex h-14 shrink-0 items-center gap-1 border-b px-2 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Відкрити меню"
        >
          <Menu className="size-5" />
        </Button>
        <Logo />
        {/* Kept out of the drawer: switching the theme is one tap, and putting
            it behind a drawer makes it three. */}
        <ThemeToggle className="ml-auto" />
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-72 p-0"
          // Closes on a tap on ANY link in the nav, caught here by delegation
          // rather than handed to each one — `Sidebar` stays a nav and knows
          // nothing about a drawer.
          //
          // This is not the same case as the pathname watcher above, and both
          // are needed. The watcher handles a route that CHANGES, including the
          // ones no link fires — a redirect after saving, the back button. This
          // handles tapping the entry for the page you are already on, where
          // the path never changes and the watcher rightly never fires, but the
          // person has acted and expects the drawer to go.
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) setOpen(false);
          }}
        >
          {/* Radix requires a title on a dialog surface for the screen reader
              to announce what opened. It is not drawn — the nav below says
              what this is to anybody who can see it. */}
          <SheetTitle className="sr-only">Навігація</SheetTitle>
          <Sidebar {...props} inDrawer />
        </SheetContent>
      </Sheet>
    </>
  );
}

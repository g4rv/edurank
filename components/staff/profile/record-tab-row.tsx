import { StaffTabs } from '@/components/staff/staff-tabs';
import { FileDown, ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/aurora/ui/button';
import { Switch } from '@/components/aurora/ui/switch';
import { ToolbarGroup, ToolbarDivider, ToolbarRow } from '@/components/staff/record-toolbar';

/**
 * The record's tab bar, and the open tab's own controls, on one line.
 *
 * **Rendered by each tab's page, not by the layout.** The controls belong to the
 * tab and the row belongs above it; a page cannot hand anything to its layout,
 * and both mechanisms that could have — a client portal and a `@toolbar`
 * parallel route — were built and removed. See `(record)/layout.tsx`.
 */
export function RecordTabRow({
  staffId,
  showRating,
  showStaffPages = true,
  children,
}: {
  staffId: string;
  showRating: boolean;
  /**
   * Whether this reader may open the Профіль and Рейтинг tabs.
   *
   * A завідувач is an ordinary `USER`, so those two send them to their own
   * record — but the Характеристика is theirs to read. Offering tabs that
   * bounce is worse than offering none, and `StaffTabs` renders nothing at all
   * once only one is left. Only the Характеристика page has a reader who is not
   * ADMIN or EDITOR, so only that page passes this.
   */
  showStaffPages?: boolean;
  /** This tab's controls — normally one `ToolbarGroup`. */
  children?: React.ReactNode;
}) {
  return (
    <ToolbarRow>
      {/* No `active` prop: `StaffTabs` reads the pathname, which is also how it
          survives being re-rendered by each tab in turn. */}
      <StaffTabs staffId={staffId} showRating={showRating} showStaffPages={showStaffPages} />
      {children}
    </ToolbarRow>
  );
}

/**
 * The same row while the tab loads.
 *
 * **The tab bar is the REAL one, and so is every word in the toolbar** (owner,
 * 2026-09-09). «Профіль», «Рік», «Вивантажити Excel» and the rest are static
 * text that never depended on the record, so they are printed rather than
 * approximated; only the values shimmer.
 *
 * This reverses an earlier decision to grey the tab bar out. That was right at
 * the time — a live coloured control in an otherwise entirely grey frame read as
 * a page that had failed halfway. It stops being true once the whole frame is
 * real text: the bar is now consistent with everything around it, and it no
 * longer blinks when you change tab, because `StaffTabs` takes its id from the
 * pathname and React sees the same element across the swap.
 */
export function RecordTabRowSkeleton({ toolbar }: { toolbar?: 'rating' | 'kharakterystyka' }) {
  return (
    <ToolbarRow>
      <StaffTabs />
      {toolbar === 'rating' && <RatingToolbarShell />}
      {toolbar === 'kharakterystyka' && <KharakterystykaToolbarShell />}
    </ToolbarRow>
  );
}

/** A control whose value has not arrived — sized like the control, not guessed. */
function ControlShimmer({ className }: { className: string }) {
  return <Skeleton className={`h-8 ${className}`} />;
}

/**
 * «Роль» is static; which buttons follow it is not — an activated person gets
 * «Скинути пароль», a non-activated one «Надіслати запрошення» — so the buttons
 * are shapes rather than words.
 *
 * **Not one of `RecordTabRowSkeleton`'s options, deliberately** (2026-09-10).
 * The other two shells stand for controls every reader of that tab receives;
 * this one is ADMIN-only, and a `loading.tsx` has no session to ask. It is the
 * Профіль page's own `Suspense` fallback instead, rendered only inside the
 * `isAdmin` branch that renders the real thing.
 */
export function AccountBarShell() {
  return (
    <ToolbarGroup className="pl-3">
      <span className="text-sm text-muted-foreground">Роль</span>
      <ControlShimmer className="w-[132px] rounded-lg" />
      <ToolbarDivider />
      <ControlShimmer className="w-[176px] rounded-md" />
      <ControlShimmer className="w-[208px] rounded-md" />
    </ToolbarGroup>
  );
}

/** Only the year and the count are unknown. */
export function RatingToolbarShell() {
  return (
    <ToolbarGroup className="pl-3">
      <span className="text-sm text-muted-foreground">Рік</span>
      {/* The select itself is static — same box, same chevron, every time. Only
          which year it holds is unknown, so only that shimmers. */}
      <span className="aurora-field flex h-8 w-28 items-center justify-between rounded-lg border px-2.5 opacity-70">
        <Skeleton className="h-4 w-10" />
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </span>
      <ToolbarDivider />
      <div className="flex items-center gap-2 pr-1">
        {/* The real switch, disabled and ON — `RatingViewProvider` starts
            `showEmpty` at true, and the complete додаток is what this table is
            for. Drawn off, it visibly flipped the moment the page loaded
            (owner, 2026-09-09). */}
        <Switch checked disabled aria-label="Показувати незаповнені" />
        <span className="text-sm">Показувати незаповнені</span>
      </div>
      <ToolbarDivider />
      <ExportShell />
    </ToolbarGroup>
  );
}

/** «позицій» and the export are static; the tally, the window and the verdict are not. */
export function KharakterystykaToolbarShell() {
  return (
    <ToolbarGroup>
      <div className="flex h-8 items-center gap-2.5 px-2">
        <Skeleton className="h-4 w-10" />
        <span className="text-sm whitespace-nowrap text-muted-foreground">позицій ·</span>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <ToolbarDivider />
      <ExportShell />
    </ToolbarGroup>
  );
}

/**
 * The export button, printed — icon, word and all.
 *
 * **Disabled rather than shimmering** (owner, 2026-09-09). Nothing about it
 * depends on the record: it is on both tabs, always, with the same label and the
 * same `FileDown`. Drawing a grey square where a known icon goes says «we do not
 * know what this is» about the one thing we do know.
 *
 * A real `Button` with `disabled`, so it is the exact size the live one will be
 * — no measured width, nothing to drift — and it cannot be clicked before the
 * route can answer. The reader sees the whole interface and that it is not ready
 * yet, which is more information than a grey box gives them.
 */
function ExportShell() {
  return (
    <Button variant="ghost" disabled>
      <FileDown className="size-4" />
      Вивантажити Excel
    </Button>
  );
}

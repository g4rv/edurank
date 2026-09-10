import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/aurora/ui/card';
import { Button } from '@/components/aurora/ui/button';
import { BreadcrumbSkeleton } from '@/components/staff/profile/profile-skeleton';
import { CARD_TITLES, RESEARCH_LABELS } from '@/components/staff/profile/cards';

/**
 * «Редагування профілю» — the НПП editing their own record.
 *
 * **It had no boundary of its own**, so `profile/loading.tsx` covered it and the
 * form loaded behind the profile's cards and a «Редагувати» button (owner,
 * 2026-09-09). That file is now scoped to a `(view)` group and this one stands
 * in for the form.
 *
 * A much smaller form than `/staff/[id]/edit`: an НПП may change their phone and
 * their four research links, and nothing else. Everything static is printed —
 * «Контакти», «Наукові профілі», the four link labels, «Зберегти», «Скасувати».
 */
export default function ProfileEditLoading() {
  return (
    <div className="space-y-5">
      <BreadcrumbSkeleton />

      <Card className="flex flex-wrap items-center gap-5">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-8 w-80 max-w-full" />
          <p className="mt-1 text-sm text-muted-foreground">Редагування профілю</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 self-start">
          <span className="text-sm text-muted-foreground">Без змін</span>
          <Button disabled>Зберегти</Button>
          <Button variant="outline" disabled>
            Скасувати
          </Button>
        </div>
      </Card>

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <div className="flex w-full flex-1 flex-col gap-4">
          <Card title="Контакти">
            <InputShell label="Телефон" />
          </Card>
        </div>
        <div className="flex w-full flex-1 flex-col gap-4">
          <Card title={CARD_TITLES.research}>
            <div className="flex flex-col gap-4">
              {Object.values(RESEARCH_LABELS).map((label) => (
                <InputShell key={label} label={label} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** A real label over an empty field box — `h-8`, the height `fieldSurface()` gives. */
function InputShell({ label }: { label: string }) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Skeleton className="h-8 w-full rounded-lg" />
    </div>
  );
}

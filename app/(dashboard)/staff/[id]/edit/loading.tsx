import { Skeleton } from '@/components/ui/skeleton';

function FormCard({ rows }: { rows: number }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <Skeleton className="mb-4 h-4 w-32" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StaffEditLoading() {
  return (
    <div className="max-w-3xl space-y-6">
      <Skeleton className="h-4 w-20" />

      <div className="space-y-1">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Основна інформація: lastName, firstName, patronymic, email, phone, isNpp */}
      <FormCard rows={6} />

      {/* Місця роботи: department + division selects, then checkbox list */}
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="mb-4 h-4 w-28" />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="size-4 shrink-0 rounded-sm" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>

      {/* Академічна інформація */}
      <FormCard rows={4} />

      {/* Наукові профілі */}
      <FormCard rows={8} />

      <div className="flex gap-3">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
    </div>
  );
}

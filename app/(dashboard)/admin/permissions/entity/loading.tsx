import { Skeleton } from '@/components/ui/skeleton';

export default function EntityPermissionsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-md" />
        ))}
      </div>

      <div className="rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3">
                <Skeleton className="h-4 w-16" />
              </th>
              <th className="px-4 py-3 text-center">
                <Skeleton className="mx-auto h-4 w-20" />
              </th>
              <th className="px-4 py-3 text-center">
                <Skeleton className="mx-auto h-4 w-20" />
              </th>
              <th className="px-4 py-3 text-center">
                <Skeleton className="mx-auto h-4 w-20" />
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-20" />
                </td>
                <td className="px-4 py-3 text-center">
                  <Skeleton className="mx-auto h-5 w-9 rounded-full" />
                </td>
                <td className="px-4 py-3 text-center">
                  <Skeleton className="mx-auto h-5 w-9 rounded-full" />
                </td>
                <td className="px-4 py-3 text-center">
                  <Skeleton className="mx-auto h-5 w-9 rounded-full" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

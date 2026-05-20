import { Skeleton } from '@/components/ui/skeleton';

const ROWS = [
  ['w-48', 'w-32', 'w-36', 'w-6'],
  ['w-56', 'w-28', 'w-40', 'w-6'],
  ['w-40', 'w-36', 'w-32', 'w-8'],
  ['w-52', 'w-24', 'w-44', 'w-6'],
  ['w-44', 'w-32', 'w-36', 'w-8'],
  ['w-48', 'w-28', 'w-40', 'w-6'],
  ['w-36', 'w-36', 'w-32', 'w-8'],
  ['w-52', 'w-24', 'w-36', 'w-6'],
] as const;

export default function DepartmentsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      <div className="rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3">
                <Skeleton className="h-4 w-16" />
              </th>
              <th className="px-4 py-3">
                <Skeleton className="h-4 w-20" />
              </th>
              <th className="px-4 py-3">
                <Skeleton className="h-4 w-14" />
              </th>
              <th className="px-4 py-3">
                <Skeleton className="h-4 w-10" />
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((cols, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <Skeleton className={`h-4 ${cols[0]}`} />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className={`h-4 ${cols[1]}`} />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className={`h-4 ${cols[2]}`} />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className={`h-4 ${cols[3]}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

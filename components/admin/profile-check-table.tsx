'use client';

import { useState } from 'react';
import { Badge } from '@/components/aurora/ui/badge';
import { ProfileCheckDetails } from '@/components/admin/profile-check-details';
import { PLATFORM_LABELS, PLATFORM_STATUS_LABELS, metricAll } from '@/lib/profile-check/labels';
import { PLATFORMS, type PlatformStatus } from '@/lib/profile-check/types';
import type { ProfileCheckRow } from '@/lib/queries/list-profile-checks';

const TONE: Record<PlatformStatus, 'ok' | 'warn' | 'destructive' | 'muted'> = {
  ok: 'ok',
  warning: 'warn',
  error: 'destructive',
  failed: 'destructive',
  no_link: 'muted',
  not_implemented: 'muted',
};

/**
 * One row per person, a pill per platform; a row opens that person's result
 * (`ProfileCheckDetails`).
 */
export function ProfileCheckTable({ rows }: { rows: ProfileCheckRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.staffId === openId) ?? null;

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">НПП</th>
              <th className="px-4 py-2.5 font-medium">Кафедра</th>
              {PLATFORMS.map((p) => (
                <th key={p} className="px-4 py-2.5 font-medium">
                  {PLATFORM_LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.staffId}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                onClick={() => setOpenId(row.staffId)}
              >
                <td className="px-4 py-2.5 font-medium">{row.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.department ?? '—'}</td>
                {PLATFORMS.map((p) => {
                  const cell = row.cells[p];
                  return (
                    <td key={p} className="px-4 py-2.5">
                      {cell ? (
                        <span className="inline-flex items-center gap-2">
                          <Badge tone={TONE[cell.status]} className="whitespace-nowrap">
                            {PLATFORM_STATUS_LABELS[cell.status]}
                          </Badge>
                          {metricAll(cell.checks.find((c) => c.field === 'h_index')) !== null && (
                            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                              h {metricAll(cell.checks.find((c) => c.field === 'h_index'))}
                            </span>
                          )}
                        </span>
                      ) : (
                        <Badge tone="muted">—</Badge>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Keyed by person, so it always opens on the first platform */}
      {open && (
        <ProfileCheckDetails key={open.staffId} row={open} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

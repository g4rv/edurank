import { db } from '@/lib/db';
import type { StakeSandboxOverlay } from './get-stake-distribution';

/**
 * ADMIN's scratch pad for one кафедра, read back.
 *
 * Always returns an overlay, even when nothing has been saved — an empty one
 * renders the кафедра's real numbers, which is what makes opening the sandbox
 * tab safe. `saved` is what the «Скинути» button keys off, and the only thing
 * that distinguishes «nothing tried yet» from «tried, and it came out the same».
 */
export interface StakeSandboxRecord extends StakeSandboxOverlay {
  saved: boolean;
  updatedAt: Date | null;
}

export const EMPTY_SANDBOX: StakeSandboxRecord = {
  kstHundredths: null,
  values: {},
  limits: {},
  saved: false,
  updatedAt: null,
};

export async function getStakeSandbox(
  userId: string,
  departmentId: string,
  year: number
): Promise<StakeSandboxRecord> {
  const row = await db.stakeSandbox.findUnique({
    where: { userId_departmentId_year: { userId, departmentId, year } },
    select: { kstHundredths: true, values: true, limits: true, updatedAt: true },
  });
  if (!row) return EMPTY_SANDBOX;

  return {
    kstHundredths: row.kstHundredths,
    // JSON columns are `unknown` to Prisma and were written by an action that
    // validated them. Anything malformed is dropped rather than trusted — a
    // sandbox is not worth a crash on a page ADMIN opens to diagnose things.
    values: readValues(row.values),
    limits: readLimits(row.limits),
    saved: true,
    updatedAt: row.updatedAt,
  };
}

function readValues(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [staffId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) out[staffId] = value;
  }
  return out;
}

function readLimits(raw: unknown): Record<string, { min: number; max: number }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, { min: number; max: number }> = {};
  for (const [staffId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const { min, max } = value as { min?: unknown; max?: unknown };
    if (typeof min !== 'number' || typeof max !== 'number') continue;
    if (!Number.isInteger(min) || !Number.isInteger(max)) continue;
    out[staffId] = { min, max };
  }
  return out;
}

import type { Prisma } from '@/lib/generated/prisma/client';
import { syncEmploymentRate } from './employment-rate';
import { DEFAULT_LIMITS, FULL_STAKE_HUNDREDTHS, PART_TIME_LIMITS } from './formula';
import { formatStake } from './units';
import { STAKE_STEP, parseStake } from './units';

export type RateSeed = { departmentId: string; hundredths: number };

/**
 * A refusal from `seedAllocations`, thrown so the transaction rolls back.
 *
 * It has to throw rather than return: the allocation is written inside the same
 * `$transaction` as the person, and a refused ставка must not leave the rest of
 * the save committed. The caller catches it and hands the sentence back.
 */
export class RateRefused extends Error {}

/** One ceiling a save would move up, in words a person can be asked about */
export type LimitRaise = {
  departmentId: string;
  departmentName: string;
  fromHundredths: number;
  toHundredths: number;
};

/**
 * Thrown when a seed is above the person's Макс and nobody has agreed to raise it.
 *
 * Like `RateRefused` it has to throw: the allocation is written inside the same
 * `$transaction` as the person, and a save that still has to be confirmed must
 * leave nothing behind. The caller turns it into a question; saying yes sends
 * the same save again with `raiseLimits`.
 */
export class LimitRaiseNeeded extends Error {
  constructor(readonly raises: LimitRaise[]) {
    super('A ставка above the ceiling needs confirmation');
  }
}

/** «Кафедра фінансів — Макс 1,00 → 2,00», for the audit log and the question */
export function describeRaises(raises: readonly LimitRaise[]): string {
  return raises
    .map(
      (r) =>
        `${r.departmentName} — Макс ${formatStake(r.fromHundredths)} → ${formatStake(r.toHundredths)}`
    )
    .join('; ');
}

/**
 * Turn what an ADMIN typed on a staff form into ставка seeds.
 *
 * Returns the first refusal instead of throwing, because the caller is a server
 * action that answers a person, not a job that can crash.
 */
export function parseRateSeeds(
  input: Record<string, string> | undefined
): { seeds: RateSeed[] } | { error: string } {
  const seeds: RateSeed[] = [];
  if (!input) return { seeds };

  for (const [departmentId, raw] of Object.entries(input)) {
    const text = raw?.trim() ?? '';
    // An empty box is «no ставка here yet», not «zero». Zero is the same
    // statement — a кафедра paying nothing is a кафедра that has not decided —
    // so neither writes a row.
    if (text === '') continue;

    const hundredths = parseStake(text);
    if (hundredths === null) return { error: 'Ставка має бути числом, наприклад 0,75' };
    if (hundredths === 0) continue;
    // The same 0,05 ladder every distributed ставка sits on. All 226 ставки in
    // the 2025 file are multiples of it, and a seed that is not would be the
    // one number on the grid nobody could have arrived at.
    if (hundredths % STAKE_STEP !== 0) return { error: 'Ставка має бути кратною 0,05' };

    seeds.push({ departmentId, hundredths });
  }

  return { seeds };
}

/**
 * Write a ставка for a person on a кафедра that has not allocated them one.
 *
 * **It can only ever ADD.** A кафедра where this person already has a
 * `StakeAllocation` is skipped in silence, and that is the whole reason this is
 * allowed to exist: `docs/stake-distribution.md` gives the split to the
 * завідувач — «an ADMIN who could quietly overwrite it would make "завідувач
 * розподіляє" untrue» — so the one thing this must not do is overwrite. Being
 * unable to is a stronger guarantee than being told not to (owner, 2026-09-21).
 *
 * It replaces the typed «Ставка» box that used to sit on the create form. That
 * box wrote `Staff.employmentRate`, which is a CACHE of Σ allocations — so the
 * first розподіл to touch the person replaced it and the number was never seen
 * again. Writing the allocation instead puts it where the sum is computed from,
 * where the profile's breakdown reads it, and where the head will find it.
 *
 * Three details that keep it out of the head's way:
 *
 * - **`formulaHundredths` equals what was typed.** Додаток 2 prints the
 *   formula's proposal beside the head's number and the document IS that
 *   comparison; a seed has had no formula run, so saying «they agree» is the
 *   only honest filling. It also means `justification` is not required, which
 *   the schema asks for only when the two differ.
 * - **`filledAt` is left alone.** A кафедра nobody has opened still reads «не
 *   заповнено» on /stakes, because one seeded row is not a head having spread
 *   their pool.
 * - **`Кст` is not consulted.** Σ may exceed the pool, exactly as it may when a
 *   head overspends — the grid shows it rather than refusing it.
 * - **A ceiling is raised, never lowered, and only when `raiseLimits` says the
 *   person agreed** — see `LimitRaiseNeeded`.
 */
export async function seedAllocations(
  tx: Prisma.TransactionClient,
  staffId: string,
  seeds: readonly RateSeed[],
  year: number,
  options: {
    /** The person agreed that the ceiling moves up to meet what was typed */
    raiseLimits?: boolean;
    /** Filled with every ceiling that was raised, for the caller's audit entry */
    raised?: LimitRaise[];
  } = {}
): Promise<string | null> {
  if (seeds.length === 0) return null;

  // Which кафедра is this person's own decides their default ceiling — 1,00
  // there, 0,25 on an additional one. The two never inherit from one another.
  const person = await tx.staff.findUnique({
    where: { id: staffId },
    select: { departmentId: true },
  });

  // Two passes. The first only CHECKS, so that «what would have to be raised»
  // is known for the whole save before anything is written — one question for
  // every кафедра, and nothing half-done if the answer is no.
  const pending: {
    departmentId: string;
    hundredths: number;
    distributionId: string;
    bounds: { minHundredths: number; maxHundredths: number };
  }[] = [];
  const raises: LimitRaise[] = [];

  for (const { departmentId, hundredths } of seeds) {
    /**
     * **No `Кст` means no ставка** (owner, 2026-09-21).
     *
     * A ставка is a share of the кафедра's pool. Until ADMIN/проректор has set
     * one there is nothing to take a share OF — «розподілено 0,75 із —» is not a
     * statement anybody can act on, and the head cannot open a meaningful grid
     * either, because the formula has no pool to spread.
     *
     * This is NOT the same as refusing to overspend. Σ may exceed `Кст` here
     * exactly as it may on the head's own grid — ladder rounding can push the
     * formula's own proposal above the pool, and `docs/stake-distribution.md`
     * settles that overspending is shown rather than refused. What is refused
     * is a pool that does not exist yet.
     */
    const pool = await tx.departmentStake.findUnique({
      where: { departmentId_year: { departmentId, year } },
      select: { kstHundredths: true },
    });
    const dept = await tx.department.findUnique({
      where: { id: departmentId },
      select: { name: true },
    });
    if (!pool) {
      return `Спершу задайте основний фонд (Кст) для кафедри «${dept?.name ?? '—'}» на ${year} рік`;
    }

    /**
     * **The same Мін/Макс the grid applies — and a ceiling that moves up.**
     *
     * A seed the grid could never have produced is a number two pages disagree
     * about: a 2,00 seeded onto a кафедра whose default ceiling is 1,00 left the
     * profile saying 2,00 and the grid saying 1,00 (owner, 2026-09-21). That was
     * refused. Since 2026-10-08 (owner: «admin should be cautious», no upper
     * limit) it is ASKED about instead: ADMIN may set any ставка, and on
     * agreeing the person's Макс on this кафедра is raised to it — so the two
     * screens agree again, by moving the ceiling rather than the number.
     *
     * The floor is still refused. Nothing lowers a Макс.
     */
    const explicit = await tx.staffStakeLimits.findUnique({
      where: { staffId_departmentId_year: { staffId, departmentId, year } },
      select: { minHundredths: true, maxHundredths: true },
    });
    const bounds =
      explicit ?? (person?.departmentId === departmentId ? DEFAULT_LIMITS : PART_TIME_LIMITS);

    if (hundredths < bounds.minHundredths) {
      return `Ставка не може бути меншою за ${formatStake(bounds.minHundredths)}`;
    }

    // A сумісник is paid less than a full ставка (owner, 2026-10-10). This is not
    // a ceiling that can be raised: it is refused outright, before any question
    // about raising one is asked.
    if (person?.departmentId !== departmentId && hundredths >= FULL_STAKE_HUNDREDTHS) {
      return `Ставка сумісника на кафедрі «${dept?.name ?? '—'}» має бути меншою за ${formatStake(FULL_STAKE_HUNDREDTHS)}`;
    }

    // The кафедра may have no distribution for this year at all — a person can
    // be hired months before anybody opens the grid.
    const distribution = await tx.stakeDistribution.upsert({
      where: { departmentId_year: { departmentId, year } },
      create: { departmentId, year },
      update: {},
      select: { id: true },
    });

    const existing = await tx.stakeAllocation.findUnique({
      where: { distributionId_staffId: { distributionId: distribution.id, staffId } },
      select: { id: true },
    });
    // Skipped, so it asks nothing: no ставка is written here and no ceiling moves.
    if (existing) continue;

    if (hundredths > bounds.maxHundredths) {
      raises.push({
        departmentId,
        departmentName: dept?.name ?? '—',
        fromHundredths: bounds.maxHundredths,
        toHundredths: hundredths,
      });
    }
    pending.push({ departmentId, hundredths, distributionId: distribution.id, bounds });
  }

  if (raises.length > 0 && !options.raiseLimits) throw new LimitRaiseNeeded(raises);

  for (const { departmentId, hundredths, distributionId, bounds } of pending) {
    if (hundredths > bounds.maxHundredths) {
      await tx.staffStakeLimits.upsert({
        where: { staffId_departmentId_year: { staffId, departmentId, year } },
        update: { maxHundredths: hundredths },
        create: {
          staffId,
          departmentId,
          year,
          minHundredths: bounds.minHundredths,
          maxHundredths: hundredths,
        },
      });
    }

    await tx.stakeAllocation.create({
      data: {
        distributionId,
        staffId,
        formulaHundredths: hundredths,
        proposedHundredths: hundredths,
      },
    });
  }
  options.raised?.push(...raises);

  // The column is Σ of every allocation this person holds — including any the
  // loop above skipped, so it has to be recomputed rather than added to.
  await syncEmploymentRate(tx, [staffId], year);
  return null;
}

// The overview's top bar — 31 кафедри added up into one line.
//
// Pure, because the sums are the whole point and the arithmetic is the part
// that goes wrong. Everything here is INTEGER HUNDREDTHS, never a float: the old
// system added floats and produced a «нерозподілено» that disagreed with the
// people in the кафедра.

/** What one кафедра contributes. A subset of `DepartmentStakeRow`, so it does
 *  not drag `lib/queries` (and therefore Prisma) into a pure module. */
export interface PoolRow {
  /** Null = the проректор has not funded this кафедра yet */
  kstHundredths: number | null;
  /** Null = the second fund has not been allocated; a different day from `Кст` */
  bonusPoolHundredths: number | null;
  /** Σ of what the завідувач handed out — ONE number, across both funds */
  distributedHundredths: number;
  /** Both funds minus what was handed out; null when there is no `Кст` */
  remainingHundredths: number | null;
}

export interface FundSplit {
  /** Taken from the main fund. Never more than the main fund holds. */
  fromBase: number;
  /** Taken from the bonus fund. Never more than the bonus fund holds. */
  fromBonus: number;
  /** What fits in neither fund — the overspend. Never negative. */
  over: number;
}

/**
 * How one кафедра's handed-out ставки divide between its two funds.
 *
 * A person has one ставка, not two, and `StakeAllocation` stores one number —
 * so which fund a given 0,05 came from is an ATTRIBUTION, not a record. Two
 * rules, and both were got wrong once before this function existed:
 *
 * 1. **The main fund fills first.** Only what it cannot hold reaches the bonus
 *    fund. The bonus fund compensates the main one, never the reverse.
 * 2. **Neither fund can be overdrawn.** Both are capped at their own size, so an
 *    excess past both is `over` — never «розподілено» from a fund, and never a
 *    negative «залишок» on the bonus card. A fund holding 0,00 that reported
 *    «залишок −0,20» is the bug this replaced (owner, 2026-08-25).
 *
 * Where `over` is then SHOWN differs by screen, and deliberately: «Усі кафедри»
 * reports it once in «Перевитрачено», because a single кафедра's overdraft must
 * not eat the залишок thirty others still have. One кафедра's own page has no
 * such box, so it lands on the main card — which is where the spending was.
 */
export function fundSplit(kst: number, bonusPool: number, distributed: number): FundSplit {
  const fromBase = Math.min(distributed, kst);
  const beyondBase = Math.max(0, distributed - kst);
  const fromBonus = Math.min(beyondBase, bonusPool);
  return { fromBase, fromBonus, over: beyondBase - fromBonus };
}

export interface FundTotals {
  /** Σ of the fund itself */
  total: number;
  /** Σ of what is attributed to this fund, capped at `total` — see `poolTotals` */
  distributed: number;
  /** `total - distributed`. Never negative: an overspend is reported separately. */
  left: number;
}

export interface PoolTotals {
  /** How many кафедри these numbers cover — the viewer's scope, not always 31 */
  departments: number;
  base: FundTotals;
  bonus: FundTotals;
  overspent: {
    /** How many кафедри handed out more than both their funds hold */
    departments: number;
    /** By how much in total, as a POSITIVE number */
    hundredths: number;
  };
  /** How many кафедри have no `Кст` at all — where work has not started */
  unfunded: number;
}

/**
 * Both funds, university-wide (or faculty-wide, for a декан).
 *
 * **«Розподілено» per fund is an attribution, not a fact.** A person has one
 * ставка, not two, and `StakeAllocation` stores one number — see `fundSplit`.
 *
 * **Neither fund ever absorbs an overspend** — see `fundSplit`. Each is capped at
 * its own size, so «розподілено» can never exceed «усього» and «залишок» never
 * goes negative. What fits in neither fund is reported once, in `overspent`.
 *
 * **A кафедра with no `Кст` is left out of both funds entirely.** Attributing
 * its spending would put the whole of it against the bonus fund, since the main
 * fund it should have come from does not exist yet. It is counted in `unfunded`
 * instead, which is the honest answer: nobody has funded it.
 */
export function poolTotals(rows: readonly PoolRow[]): PoolTotals {
  const totals: PoolTotals = {
    departments: rows.length,
    base: { total: 0, distributed: 0, left: 0 },
    bonus: { total: 0, distributed: 0, left: 0 },
    overspent: { departments: 0, hundredths: 0 },
    unfunded: 0,
  };

  for (const row of rows) {
    if (row.remainingHundredths !== null && row.remainingHundredths < 0) {
      totals.overspent.departments += 1;
      totals.overspent.hundredths += -row.remainingHundredths;
    }

    if (row.kstHundredths === null) {
      totals.unfunded += 1;
      continue;
    }

    const bonusPool = row.bonusPoolHundredths ?? 0;
    totals.base.total += row.kstHundredths;
    totals.bonus.total += bonusPool;

    // `split.over` is deliberately dropped here: this screen reports the
    // overspend once, in `overspent`, counted off `remainingHundredths` above.
    const split = fundSplit(row.kstHundredths, bonusPool, row.distributedHundredths);
    totals.base.distributed += split.fromBase;
    totals.bonus.distributed += split.fromBonus;
  }

  totals.base.left = totals.base.total - totals.base.distributed;
  totals.bonus.left = totals.bonus.total - totals.bonus.distributed;
  return totals;
}

import { cn } from '@/lib/utils';
import { formatStake } from '@/lib/stake/units';
import type { PoolTotals } from '@/lib/stake/pool-totals';
import { StakeTermHint } from '@/components/stake/stake-term-hint';

/**
 * The top bar of /stakes — what the проректор is accountable for, in one line.
 *
 * It used to print the size of the two funds and nothing else, which said where
 * work had not started («без фонду: 29») and never how far the rest had got
 * (owner, 2026-08-25). Each fund now reads усього → розподілено → залишок, which
 * is the only grouping in which those three numbers mean anything: a залишок
 * without the fund it came out of is a number you have to take on trust.
 *
 * «Залишок», not «Нерозподілено» (owner, 2026-08-25) — the кафедра grid on
 * /stakes/[id] has always called it that, and one thing should not have two
 * names across two screens.
 *
 * Both amber groups are conditional. A bar that permanently reads
 * «перевитрачено: 0» trains people to stop looking at it.
 */
export function PoolSummary({ totals }: { totals: PoolTotals }) {
  return (
    <div className="flex flex-wrap items-start gap-x-10 gap-y-4 rounded-xl border bg-card px-5 py-4 text-sm">
      <div>
        <span className="text-muted-foreground">Кафедр: </span>
        <span className="font-medium tabular-nums">{totals.departments}</span>
      </div>

      <FundGroup title="Основний фонд" term="kst" fund={totals.base} />
      <FundGroup title="Бонусний фонд" term="bonusPool" fund={totals.bonus} />

      {totals.overspent.departments > 0 && (
        <div className="text-amber-700 dark:text-amber-500">
          <p className="font-medium">Перевитрачено</p>
          <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
            {/* No `valueClass`: the numbers inherit the group's amber, which is
                the whole point of the group. */}
            <Line label="кафедр" value={String(totals.overspent.departments)} />
            <Line label="ставок" value={formatStake(totals.overspent.hundredths)} />
          </dl>
        </div>
      )}

      {totals.unfunded > 0 && (
        <div className="text-amber-700 dark:text-amber-500">
          <span>без фонду: </span>
          <span className="font-medium tabular-nums">{totals.unfunded}</span>
        </div>
      )}
    </div>
  );
}

function FundGroup({
  title,
  term,
  fund,
}: {
  title: string;
  term: 'kst' | 'bonusPool';
  fund: PoolTotals['base'];
}) {
  return (
    <div>
      {/* The heading keeps its ⓘ — «Основний фонд» and «Бонусний фонд» are the
          two terms out of the положення that a reader may not know. The three
          lines under it are plain words and carry no hint (owner, 2026-08-25). */}
      <p className="inline-flex items-center gap-1 font-medium">
        {title}
        <StakeTermHint term={term} />
      </p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <Line label="усього" value={formatStake(fund.total)} valueClass="text-foreground" />
        <Line
          label="розподілено"
          value={formatStake(fund.distributed)}
          valueClass="text-foreground"
        />
        {/* Never negative: `poolTotals` caps each fund at its own size and puts
            the excess in «Перевитрачено» instead. */}
        <Line label="залишок" value={formatStake(fund.left)} valueClass="text-foreground" />
      </dl>
    </div>
  );
}

/** One `label → number` pair of a group's grid. Colour is the caller's call:
 *  inside an amber group the value must inherit it, inside a fund group it has
 *  to sit darker than its muted label. */
function Line({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={cn('text-right font-medium tabular-nums', valueClass)}>{value}</dd>
    </>
  );
}

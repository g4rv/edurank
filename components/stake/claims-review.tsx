'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBonus } from '@/lib/stake/units';
import { cn } from '@/lib/utils';
import type { ReviewClaim } from '@/lib/queries/list-student-claims';
import { decideStudentClaim } from '@/app/(dashboard)/my-department/students/actions';

const DEGREE = { BACHELOR: 'Бакалавр', MASTER: 'Магістр' } as const;
const FORM = { FULL_TIME: 'Денна', PART_TIME: 'Заочна' } as const;
const FUNDING = { STATE: 'Бюджет', CONTRACT: 'Контракт' } as const;

/**
 * The завідувач's view of the students their staff claim.
 *
 * **A report, not an arbitration tool.** When two people claim one student
 * there is no in-system winner: this shows the duplicate, who filed first, and
 * how many of that person's claims are contested — and then the head talks to
 * them. The resolution happens off-screen (decided 2026-08-07), which is why
 * there is no «assign to» button and no verdict field. Confirm and reject, one
 * claim at a time, are the only controls, and every temptation to add a
 * resolution control here should be resisted.
 */
export function ClaimsReview({ claims, year }: { claims: ReviewClaim[]; year: number }) {
  const contested = claims.filter((c) => c.contested && c.status === 'PENDING');
  const pending = claims.filter((c) => c.status === 'PENDING');

  if (claims.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        За {year} рік ніхто з кафедри ще не додав залучених здобувачів.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-muted/30 px-4 py-2 text-xs">
        <span>
          Усього заявок: <strong className="tabular-nums">{claims.length}</strong>
        </span>
        <span>
          На розгляді: <strong className="tabular-nums">{pending.length}</strong>
        </span>
        {contested.length > 0 && (
          <span className="text-amber-700 dark:text-amber-500">
            Спірних: <strong className="tabular-nums">{contested.length}</strong>
          </span>
        )}
      </div>

      {contested.length > 0 && (
        <p className="max-w-3xl rounded-lg border border-amber-600/30 bg-amber-600/5 px-4 py-2 text-xs text-amber-700 dark:text-amber-500">
          Спірна заявка означає, що цього здобувача на цю саму спеціальність вказав ще хтось. Хто
          подав першим — видно нижче, але це не робить його правим. Система лише показує збіг;
          рішення ухвалюєте ви, поговоривши з людиною.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-left">
              <th className="border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground">
                Здобувач
              </th>
              <th className="border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground">
                Хто вказав
              </th>
              <th className="border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground">
                Спеціальність
              </th>
              <th className="w-20 border border-border px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
                Ставка
              </th>
              <th className="w-28 border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground">
                Подано
              </th>
              <th className="w-64 border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground">
                Рішення
              </th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <ClaimRow key={claim.id} claim={claim} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClaimRow({ claim }: { claim: ReviewClaim }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: 'CONFIRMED' | 'REJECTED') {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set('claimId', claim.id);
      form.set('decision', decision);
      if (decision === 'REJECTED') form.set('reason', reason);
      const result = await decideStudentClaim(null, form);
      if (result && 'error' in result) setError(result.error);
      else {
        setRejecting(false);
        setReason('');
        toast.success(decision === 'CONFIRMED' ? 'Підтверджено' : 'Відхилено');
      }
    });
  }

  return (
    <tr className={cn('transition-colors hover:bg-muted/20', claim.contested && 'bg-amber-600/5')}>
      <td className="border border-border px-3 py-2">
        {claim.studentName}
        {claim.contested && (
          <span
            className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-500"
            title="Цього здобувача вказав ще хтось"
          >
            <AlertTriangle className="size-3" />
            спірна
          </span>
        )}
      </td>

      <td className="border border-border px-3 py-2">
        <span className="whitespace-nowrap">{claim.claimedBy}</span>
        {/* One contested claim is noise. «7 of this person's 9 are contested»
            is a pattern, and it is the number the head actually needs. */}
        {claim.claimantContestedCount > 1 && (
          <p className="text-xs text-amber-700 dark:text-amber-500">
            спірних у цієї людини: {claim.claimantContestedCount}
          </p>
        )}
      </td>

      <td className="border border-border px-3 py-2 text-xs text-muted-foreground">
        {claim.speciality}
        <span className="block">
          {DEGREE[claim.degree]} · {FORM[claim.form]} · {FUNDING[claim.funding]}
        </span>
      </td>

      <td className="border border-border px-3 py-2 text-right tabular-nums">
        {claim.unpriced ? (
          <span
            className="text-xs text-amber-700 dark:text-amber-500"
            title="Для цієї спеціальності ще не встановлено норматив на цей рік"
          >
            —
          </span>
        ) : (
          `+${formatBonus(claim.value)}`
        )}
      </td>

      <td className="border border-border px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
        {claim.createdAt.toLocaleDateString('uk-UA')}
        {claim.contested && claim.wasFirst && (
          <span className="block font-medium text-foreground" title="Подано раніше за інших">
            подано першим
          </span>
        )}
      </td>

      <td className="border border-border px-3 py-2">
        {claim.status === 'CONFIRMED' && (
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Підтверджено
          </span>
        )}
        {claim.status === 'REJECTED' && (
          <div>
            <span className="text-xs font-medium text-destructive">Відхилено</span>
            {claim.rejectReason && (
              <p className="text-xs text-muted-foreground">{claim.rejectReason}</p>
            )}
          </div>
        )}

        {claim.status === 'PENDING' && !rejecting && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => decide('CONFIRMED')}
            >
              <Check className="size-4" />
              Підтвердити
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(true)}>
              <X className="size-4" />
              Відхилити
            </Button>
          </div>
        )}

        {claim.status === 'PENDING' && rejecting && (
          <div className="space-y-1">
            {/* The reason reaches the НПП, exactly as a discarded rating entry
                does — «відхилено» with no word is the thing people escalate. */}
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Причина — її побачить НПП"
              aria-label={`Причина відхилення для ${claim.studentName}`}
              disabled={pending}
              className="h-8"
            />
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => decide('REJECTED')}
              >
                Відхилити
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setRejecting(false);
                  setError(null);
                }}
              >
                Скасувати
              </Button>
            </div>
          </div>
        )}

        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
    </tr>
  );
}

import type { StaffDetail } from '@/lib/queries/get-staff';
import { cn } from '@/lib/utils';
import { Mail, Phone } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/phone';
import { Avatar } from '@/components/ui/avatar';
import { CopyButton } from '@/components/ui/copy-button';
import { fullName } from './primitives';

/**
 * Who this is — the band the whole page hangs from.
 *
 * The old header was a name and a badge. Two things a reader actually wanted
 * were missing:
 *
 * The кафедра and the rank were briefly here too and have gone back to the
 * cards (owner, 2026-09-07). Both were second copies: the кафедра of «Місця
 * роботи» — and a сумісник has TWO, so a band with room for one always
 * misrepresented somebody — and звання/ступінь of «Академічна інформація».
 *
 * What is left is what identifies a person and how you reach them, which is all
 * a header owes anybody.
 * - **Email and phone**, each with a copy button. They had a card of their own
 *   further down the page; they are how you actually reach a person, so they
 *   belong to the name rather than to a section somebody has to scroll to.
 * - **A face.** `Avatar` — round, because a circle means a person. Initials
 *   for now, a photograph the moment uploads exist, with no call site moving.
 *   Not decoration: it gives a page about a person a subject, and makes one
 *   profile tellable from another at a glance in a list of them.
 *
 * `actions` stays a slot — which buttons exist depends on permissions this
 * component has no business reading.
 */
export function IdentityBand({
  staff,
  actions,
}: {
  staff: StaffDetail;
  actions?: React.ReactNode;
}) {
  // A null departmentId IS the сумісник marker: somebody with only an
  // additional кафедра has no primary one. Still worth a badge, because their
  // ставка comes out of two pools and does not count toward this кафедра's Кнпп.
  const isPartTimeOnly = !staff.department && staff.partTimeDepartments.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-xl border bg-card p-5 shadow-card">
      <Avatar name={fullName(staff)} size="lg" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">{fullName(staff)}</h1>
          <Badge tone={staff.isNpp ? 'brand' : 'muted'}>
            {staff.isNpp ? 'НПП' : 'Адміністративний'}
          </Badge>
          {/* Amber, like everywhere else this appears: a сумісник's ставка comes
              out of two pools and does not count toward this кафедра's Кнпп, so
              it is something to notice rather than a neutral fact. */}
          {isPartTimeOnly && <Badge tone="warn">Сумісник</Badge>}
          {staff.archivedAt && <Badge tone="muted">Архівований</Badge>}
        </div>

        {/* Email and phone belong to identity, not to a card of their own. They
            were a «Контакти» box two thirds down the page — the one thing
            somebody looking a colleague up is most likely to have come for, put
            where they had to go looking. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Mail aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <a href={`mailto:${staff.email}`} className="transition-colors hover:text-brand">
              {staff.email}
            </a>
            <CopyButton value={staff.email} what="email" className="size-6" />
          </span>

          {staff.phone && (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <Phone aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <a href={`tel:${staff.phone}`} className="transition-colors hover:text-brand">
                {formatPhoneDisplay(staff.phone)}
              </a>
              {/* Copies the STORED form («+380441234567»), not the spaced one on
                  screen: what gets pasted goes into a dialler or another field,
                  and the grouping is for reading, not for machines. */}
              <CopyButton value={staff.phone} what="телефон" className="size-6" />
            </span>
          )}
        </div>

        {staff.archivedAt && (
          <p className="mt-3 text-sm text-muted-foreground">
            Не враховується в рейтингу поточного року, вхід у систему вимкнено
            {staff.archiveReason ? ` — ${staff.archiveReason}` : ''}
          </p>
        )}
      </div>

      {/* Pinned to the top rather than centred with the rest: an action
          belongs to the corner of the card, and dropping it to the middle of a
          tall band leaves it floating with nothing to align to. */}
      {actions && <div className="flex shrink-0 items-center gap-2 self-start">{actions}</div>}
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: 'brand' | 'muted' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone === 'brand' && 'bg-brand/10 text-brand-strong',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'warn' && 'bg-amber-500/12 text-amber-700 dark:text-amber-400'
      )}
    >
      {children}
    </span>
  );
}

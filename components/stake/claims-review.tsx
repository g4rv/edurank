'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/aurora/ui/button';
import { Input } from '@/components/aurora/ui/input';
import { EmptyState } from '@/components/aurora/ui/card';
import { ListHeader } from '@/components/aurora/ui/list-header';
import {
  SortHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@/components/aurora/ui/table';
import { ClaimsFilters } from '@/components/stake/claims-filters';
import { formatBonus } from '@/lib/stake/units';
import {
  STUDENT_DEGREE_LABELS as DEGREE,
  STUDENT_FUNDING_LABELS as FUNDING,
  STUDY_FORM_LABELS as FORM,
} from '@/lib/labels';
import { formatSpeciality, specialityCodeSortKey } from '@/lib/specialities/codes';
import { cn } from '@/lib/utils';
import type { ReviewClaim } from '@/lib/queries/list-student-claims';
import { decideStudentClaim } from '@/app/(dashboard)/my-department/students/actions';

/** Every column except «Рішення», which has no order worth putting rows in */
type SortKey = 'student' | 'claimant' | 'speciality' | 'value' | 'date';

const SORT_LABEL: Record<SortKey, string> = {
  student: 'Здобувач',
  claimant: 'Хто вказав',
  speciality: 'Спеціальність',
  value: 'Ставка',
  date: 'Подано',
};

/**
 * One CSS width per column, in the order they are rendered. Even numbers
 * throughout — §4 of `docs/aurora.md`.
 *
 * **The кафедра is no longer a column.** Seven columns did not fit a laptop,
 * and the кафедра is a fact about the CLAIMANT rather than about the claim — so
 * it sits under their name, exactly as `/staff` puts a сумісництво under a
 * кафедра. That is what buys «Рішення» the width its two buttons need.
 *
 * **The здобувач is a declared width and the claimant is the flexible one**
 * (owner, 2026-09-21). It was the other way round, which put every spare pixel
 * into a column holding one ПІБ — on a wide monitor that was ~450px of empty
 * cell — while «Кафедра соціальної педагогіки і соціальної роботи» wrapped to
 * FOUR lines next to it. The slack belongs to the longest text on the row, and
 * that is the кафедра, not the name.
 *
 * **19rem because the ПІБ is one line** (owner, 2026-09-21). Measured at
 * `font-semibold` 14px: the longest name in the register renders at 260px, and
 * 19rem leaves 272px of content. A hypothetical double-barrelled outlier
 * («Пархоменко-Куцевіл Олександра Володимирівна», 339px) would need 24rem,
 * which the other five columns cannot spare — that one truncates with its full
 * text on `title` rather than dragging every row a line taller.
 */
const STUDENT_COLUMN = '19rem';
const SPECIALITY_COLUMN = '11rem';
/** «СТАВКА» is what sets this, not «+0,000» — the heading is the wider of the two. */
const VALUE_COLUMN = '6rem';
/**
 * Wide enough for «подано першим» to have AIR, not merely to fit.
 *
 * The note is the widest thing in this column, not the date. At 7rem it was
 * wider than the cell and hung out to the right; at 8rem it measured 95px in a
 * 96px content box — technically centred, and it still read as misaligned
 * (owner, 2026-09-21), because a line touching both padding edges next to a
 * date that does not looks like two different alignments. 10rem leaves 64px
 * around it.
 *
 * The rem it costs comes from «Спеціальність» and the claimant floor, not from
 * «Здобувач», which needs all 19 to keep a ПІБ on one line.
 */
const DATE_COLUMN = '10rem';
/**
 * **The two buttons STACK, and the column is sized for that.** Side by side they
 * need 16rem, which put the six columns at 70rem (1120px) against the 1109px a
 * 1366px window leaves — so the card scrolled sideways on every screen. Stacked
 * they fit 11rem, and the rows are already two or three lines tall because of
 * the кафедра and the ступінь lines, so the height costs nothing.
 *
 * A reader with no buttons gets one word, and needs far less.
 */
const DECISION_COLUMN = { decide: '11rem', read: '7rem' } as const;
/** The floor the flexible claimant column may shrink to before the card scrolls. */
const CLAIMANT_FLOOR = '11rem';

/** Substring match, case-folded for Ukrainian. */
const matches = (haystack: string, needle: string) =>
  haystack.toLocaleLowerCase('uk').includes(needle.toLocaleLowerCase('uk'));

/**
 * ## Sizes, because this table used to be 12px almost everywhere
 *
 * **A table cell is a VALUE, and values are `text-sm`** — §4 of
 * `docs/aurora.md`, and the same finding `/staff` already wrote down: «the
 * ступінь was `text-xs` and the звання above it `text-sm`, which drew a
 * hierarchy that does not exist». The кафедра under a claimant, the
 * ступінь·форма·фінансування line, the date, the reject reason and «Відхилено»
 * were all 12px here (owner, 2026-09-21: «why you keep using 12px text????»).
 * Every one of them is data somebody reads.
 *
 * **And they are INK, not `--muted-foreground`.** §4 again: «ink is the default,
 * it needs no class — headings, labels, values, names, figures, column headings
 * and table cells are all ink». Every cell on this screen was muted, which is
 * 5.51 against ink's 19.8 — a whole table painted in the tier §4 reserves for
 * «meta, counts, hints, glanced at rather than read» (owner, 2026-09-21: «dont
 * blend colors with bg, keep the contrast… muted is way too faded, it is good
 * only for details»). `/staff`'s table is entirely ink and says so about its
 * own email column: «an address is data somebody reads and copies».
 *
 * **Two lines in one cell are separated by WEIGHT, not by fading the second
 * one.** The кафедра under a claimant is not a lesser fact than the person, it
 * is a different one; the ступінь is not a lesser fact than the спеціальність.
 * Fading the lower line ranks them, and they are not ranked.
 *
 * `text-xs` survives in **one** place: the «спірна» badge. That is the size
 * every badge in the app wears — the НПП and «Архів» pills on `/staff`, «Не
 * активований», «Сумісник» — so it is the convention rather than an exception,
 * and changing it here alone would make this the odd badge out.
 *
 * The counts strip was the last holdout and went to `text-sm` too: «Усього
 * заявок: 8» is a statement somebody reads, not a caption they skip.
 */

/**
 * The row that wears the «спірна» mark — the LATER claim of a duplicate.
 *
 * **One predicate, three readers**: the badge on the row, the «Лише спірні»
 * filter, and the count in the strip. Written out at each of them they drift,
 * and the first version of the filter did exactly that — it matched
 * `c.contested`, which is true of BOTH halves, so switching the filter on
 * returned two rows for one dispute while only one of them was marked.
 *
 * **Only the marked row is a dispute** (owner, 2026-09-21). The earlier claim
 * is not in question — it got in first, and its row says so — so a filter that
 * returned it too was answering «show me everything touched by a duplicate»
 * when the question is «show me the ones to deal with». Nothing is lost by
 * leaving it out: the marked row names who filed first and on which кафедра,
 * which is the whole reason that line exists.
 */
const isFlagged = (c: ReviewClaim) => c.contested && !c.wasFirst;

/**
 * The review of the students staff claim — ADMIN decides, everyone else reads.
 *
 * **A report, not an arbitration tool.** When two people claim one student
 * there is no in-system winner: this shows the duplicate, who filed first, and
 * how many of that person's claims are contested — and then somebody talks to
 * them. The resolution happens off-screen (decided 2026-08-07), which is why
 * there is no «assign to» button and no verdict field. Confirm and reject, one
 * claim at a time, are the only controls, and every temptation to add a
 * resolution control here should be resisted.
 *
 * **It renders the header card as well as the table** (2026-09-21). The filters
 * are client state — see `ClaimsFilters` — and the header band is where they
 * belong, so the component that owns the state owns both. The page keeps what
 * only a server can answer: who may look, who may decide, and the кафедра
 * picker that changes what is fetched.
 */
export function ClaimsReview({
  claims,
  year,
  canDecide,
  showDepartment = false,
  title,
  subtitle,
  departmentSelect,
}: {
  claims: ReviewClaim[];
  year: number;
  /** False for a декан and for a завідувач, who oversee but do not rule */
  canDecide: boolean;
  /**
   * «Усі кафедри» is selected, so a row can come from any of them.
   *
   * Off when one кафедра is chosen: repeating the same word on every row says
   * nothing. It no longer adds a COLUMN — it adds a line under the claimant.
   */
  showDepartment?: boolean;
  title: string;
  subtitle: React.ReactNode;
  /** The кафедра picker — see `ClaimsFilters` for why the page owns it */
  departmentSelect?: React.ReactNode;
}) {
  // Both read `isFlagged`, so the strip, the switch and the badge on the row
  // can never disagree about what «спірна» means.
  //
  // **The strip counts DISPUTES, not claims caught up in one.** It is work
  // left, so it is the pending ones — and one marked row is one argument to
  // have, whereas counting both halves said «2» about a single disagreement.
  //
  // The switch, though, must reach a dispute whatever its status: the confirmed
  // half is exactly what somebody re-checking a decision is looking for.
  const contestedPending = claims.filter((c) => isFlagged(c) && c.status === 'PENDING');
  const hasContested = claims.some(isFlagged);
  const pending = claims.filter((c) => c.status === 'PENDING');

  // One box over both names — see `ClaimsFilters` for why it is not two.
  const [search, setSearch] = useState('');
  const [contestedOnly, setContestedOnly] = useState(false);

  // Default: the rows that need a decision, disputed ones first, oldest first.
  // That is the order the page exists to produce — sorting is for looking
  // something up, not for finding the work.
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);

  // **Filter, then sort.** The other order works and costs more: sorting is a
  // comparison per pair over the whole set, and there is no reason to order
  // rows that are about to be dropped.
  const visible = useMemo(() => {
    const needle = search.trim();
    const rows = claims.filter(
      (c) =>
        // Either name. A row is what the reader is looking for whether they
        // remembered the здобувач or the person who claimed them.
        (!needle || matches(c.studentName, needle) || matches(c.claimedBy, needle)) &&
        // The marked row only — see `isFlagged`.
        (!contestedOnly || isFlagged(c))
    );

    if (!sort) {
      return rows.sort((a, b) => {
        const decided = (c: ReviewClaim) => (c.status === 'PENDING' ? 0 : 1);
        return (
          decided(a) - decided(b) ||
          Number(b.contested) - Number(a.contested) ||
          a.createdAt.getTime() - b.createdAt.getTime()
        );
      });
    }
    const dir = sort.desc ? -1 : 1;
    return rows.sort((a, b) => {
      switch (sort.key) {
        case 'student':
          return dir * a.studentName.localeCompare(b.studentName, 'uk');
        // Кафедра first, then who inside it. The кафедра lives on this column
        // now, and ordering by the person alone scatters one кафедра's rows.
        case 'claimant':
          return (
            dir *
            (a.claimedByDepartment.localeCompare(b.claimedByDepartment, 'uk') ||
              a.claimedBy.localeCompare(b.claimedBy, 'uk'))
          );
        // By CODE, not alphabetically: the перелік's own order groups A4.01…
        // A4.16 together, which is what somebody scanning for «усі Середні
        // освіти» is actually looking for. Ties fall back to the name.
        case 'speciality':
          return (
            dir *
            (specialityCodeSortKey(a.speciality).localeCompare(
              specialityCodeSortKey(b.speciality)
            ) || a.speciality.localeCompare(b.speciality, 'uk'))
          );
        case 'value':
          return dir * (a.value - b.value);
        case 'date':
          return dir * (a.createdAt.getTime() - b.createdAt.getTime());
      }
    });
  }, [claims, sort, search, contestedOnly]);

  function toggle(key: SortKey) {
    setSort((current) =>
      // Third click clears it, back to the working order the page opens in.
      current?.key !== key ? { key, desc: false } : current.desc ? null : { key, desc: true }
    );
  }

  const filtering = Boolean(search || contestedOnly);
  const decisionWidth = canDecide ? DECISION_COLUMN.decide : DECISION_COLUMN.read;
  const columns = [
    STUDENT_COLUMN,
    null,
    SPECIALITY_COLUMN,
    VALUE_COLUMN,
    DATE_COLUMN,
    decisionWidth,
  ];
  const minWidth = `calc(${STUDENT_COLUMN} + ${CLAIMANT_FLOOR} + ${SPECIALITY_COLUMN} + ${VALUE_COLUMN} + ${DATE_COLUMN} + ${decisionWidth})`;

  const sortHead = (key: SortKey, numeric = false, align?: 'center') => (
    <SortHead
      label={SORT_LABEL[key]}
      numeric={numeric}
      align={align}
      onClick={() => toggle(key)}
      active={sort?.key === key}
      dir={sort?.desc ? 'desc' : 'asc'}
    />
  );

  const head = (
    <TableRow>
      {sortHead('student')}
      {sortHead('claimant')}
      {sortHead('speciality')}
      {sortHead('value', true, 'center')}
      {sortHead('date', false, 'center')}
      <TableHead>{canDecide ? 'Рішення' : 'Статус'}</TableHead>
    </TableRow>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title={title}
        subtitle={subtitle}
        filters={
          <div className="space-y-3">
            <ClaimsFilters
              search={search}
              onSearch={setSearch}
              contestedOnly={contestedOnly}
              onContestedOnly={setContestedOnly}
              hasContested={hasContested}
              departmentSelect={departmentSelect}
            />

            {/* The counts describe the WHOLE year, not the filtered view. They
                are why somebody is on this page, and a «На розгляді: 0» that
                only meant «your search matched none» would be a lie about the
                work left. What is on screen is said separately, and only while
                a filter is actually on. */}
            {/* **`text-sm`, and ONE colour per figure** (owner, 2026-09-21).
                It was `text-xs` with the label muted and the number
                `text-foreground` — «Усього заявок: 8» painted in two colours,
                which reads as two separate things rather than one statement.
                A label and its figure are one phrase; the weight on the number
                is enough to pick it out, and weight does not split a sentence
                the way a colour change does.

                «Спірних» takes the hue across the WHOLE phrase for the same
                reason — the colour belongs to the fact, not to the digit. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span>
                Усього заявок:{' '}
                <strong className="font-semibold tabular-nums">{claims.length}</strong>
              </span>
              <span>
                На розгляді:{' '}
                <strong className="font-semibold tabular-nums">{pending.length}</strong>
              </span>
              {contestedPending.length > 0 && (
                <span className="text-warning">
                  Спірних:{' '}
                  <strong className="font-semibold tabular-nums">{contestedPending.length}</strong>
                </span>
              )}
              {filtering && (
                <span>
                  Показано: <strong className="font-semibold tabular-nums">{visible.length}</strong>
                </span>
              )}
            </div>
          </div>
        }
      />

      {/* Hidden while filtering: it explains the «спірна» mark, and somebody who
          has just switched «Лише спірні» on has read it or does not need it.
          The card is the only thing between the filters and the rows they
          changed, and a paragraph there pushes the result off the fold. */}
      {contestedPending.length > 0 && !filtering && (
        <p className="shrink-0 rounded-xl border border-warning/40 bg-warning-surface px-4 py-3 text-sm text-warning">
          Позначку «спірна» має лише та заявка, яку подали пізніше — поряд із нею вказано, хто подав
          цього здобувача першим і на якій він кафедрі. Раніше — не означає правіше: система лише
          показує збіг,{' '}
          {canDecide
            ? 'а рішення ухвалюєте ви, поговоривши з обома.'
            : 'а рішення ухвалює адміністратор, поговоривши з обома.'}
        </p>
      )}

      {claims.length === 0 ? (
        <EmptyState>
          {showDepartment
            ? `За ${year} рік ніхто ще не додав залучених здобувачів.`
            : `За ${year} рік ніхто з кафедри ще не додав залучених здобувачів.`}
        </EmptyState>
      ) : visible.length === 0 ? (
        // An empty table under a filter bar reads as «there is nothing», which
        // is exactly the wrong conclusion. §5's `EmptyState` takes an action for
        // this: the offer to undo what caused it.
        <EmptyState
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setContestedOnly(false);
              }}
            >
              Скинути фільтри
            </Button>
          }
        >
          Жодна заявка не підходить під фільтри.
        </EmptyState>
      ) : (
        <Table columns={columns} minWidth={minWidth} head={head} fill>
          <TableBody>
            {visible.map((claim) => (
              <ClaimRow
                key={claim.id}
                claim={claim}
                canDecide={canDecide}
                showDepartment={showDepartment}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ClaimRow({
  claim,
  canDecide,
  showDepartment,
}: {
  claim: ReviewClaim;
  canDecide: boolean;
  showDepartment: boolean;
}) {
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

  const flagged = isFlagged(claim);

  return (
    // Tinted on the same rule as the tag: the row that got in first is not the
    // questionable one, so colouring it amber contradicted its own label.
    // `[&>td]:align-middle`, like `/faculties`, `/departments` and `/staff`:
    // rows here are two to four lines tall and the controls are one, so
    // top-aligned they sat at a different height in every row.
    <TableRow hoverable className={cn('[&>td]:align-middle', flagged && 'bg-warning-surface')}>
      {/* **Left horizontally, centred vertically** (owner, 2026-09-21). The
          vertical centring is the row's `[&>td]:align-middle`; horizontally a
          ПІБ starts at the same x on every row, so the column can be read
          straight down. Centred, each name started at a different place and
          the eye had to find the beginning of every one. */}
      <TableCell>
        {/* **One line, and the heaviest thing on the row.** It is what the row
            is about, and a ПІБ broken across two lines is read twice. `truncate`
            rather than wrapping for the rare name that still will not fit —
            with the whole of it on `title`, which a wrapped name never needed
            but a clipped one does. */}
        <span className="block truncate font-semibold" title={claim.studentName}>
          {claim.studentName}
        </span>

        {/* The mark and the note share the line under the name, so the name
            keeps its own. Only the later claim is flagged — marking both said
            «there is a problem here» twice and gave the reader nowhere to
            start. */}
        {(flagged || claim.firstClaimedBy) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5">
            {flagged && (
              <span
                className="inline-flex items-center gap-1 text-xs text-warning"
                title="Цього здобувача раніше вказала інша людина"
              >
                <AlertTriangle className="size-3" />
                спірна
              </span>
            )}
            {claim.firstClaimedBy && (
              <span>
                першим подав {claim.firstClaimedBy}
                {claim.firstClaimedByDepartment && ` · ${claim.firstClaimedByDepartment}`}
              </span>
            )}
          </span>
        )}
      </TableCell>

      <TableCell>
        {/* Wraps (2026-08-17). A ПІБ held on one line is the widest cell in the
            table, and it was pushing «Рішення» — the only thing anybody presses
            here — off the right edge into a horizontal scrollbar at around
            1024px. A name over two lines costs a row of height; a button nobody
            can see costs the page its purpose. */}
        {/* `font-medium`, like the здобувач. Without it the name and the
            кафедра under it were the same weight AND the same colour, so the
            cell read as one four-line paragraph (owner, 2026-09-21). Weight is
            what separates two lines here — §4 will not let the second one be
            faded, and it should not be. */}
        <span className="font-medium">{claim.claimedBy}</span>
        {/* The кафедра, where it used to be its own 14rem column. Muted, because
            it identifies the person above rather than answering anything the
            reader came for. */}
        {showDepartment && <span className="mt-0.5 block">{claim.claimedByDepartment}</span>}
        {/* One contested claim is noise. «7 of this person's 9 are contested»
            is a pattern, and it is the number the reader actually needs. */}
        {claim.claimantContestedCount > 1 && (
          <p className="mt-0.5 text-warning">
            спірних у цієї людини: {claim.claimantContestedCount}
          </p>
        )}
      </TableCell>

      {/* «compact» because this column is narrow and thirteen of our
          specialities begin with the same two words. The style is the only
          thing to change if a fuller form reads better here. */}
      <TableCell>
        {/* Same as the claimant: the спеціальність is the line, the
            ступінь·форма·фінансування under it is the qualifier. */}
        <span className="font-medium" title={claim.speciality}>
          {formatSpeciality(claim.speciality, 'compact')}
        </span>
        <span className="mt-0.5 block">
          {DEGREE[claim.degree]} · {FORM[claim.form]} · {FUNDING[claim.funding]}
        </span>
      </TableCell>

      {/* Centred, not right-aligned (owner, 2026-09-21). Every value here is
          «+0,000» — one shape, four characters — so there are no digits of
          differing length for a right edge to line up, and against a 7rem
          column set by its own heading the figures sat hard against the
          divider. `align` keeps `numeric`'s `tabular-nums`. */}
      <TableCell numeric align="center">
        {claim.unpriced ? (
          <span
            className="text-warning"
            title="Для цієї спеціальності ще не встановлено норматив на цей рік"
          >
            —
          </span>
        ) : (
          `+${formatBonus(claim.value)}`
        )}
      </TableCell>

      {/* Centred like «Ставка» beside it, and `numeric` for the `tabular-nums`:
          every date is `dd.mm.yyyy`, one fixed shape, so there is nothing for a
          right edge to line up and a centred column sits under its own heading
          instead of against the divider. */}
      <TableCell numeric align="center" className="whitespace-nowrap">
        {claim.createdAt.toLocaleDateString('uk-UA')}
        {/* Same colour as the date above it, weight for the emphasis — the
            fault the counts strip had, one cell over: «22.08.2026» muted with
            «подано першим» in near-black underneath made one cell read as two
            unrelated things. */}
        {claim.contested && claim.wasFirst && (
          <span className="mt-0.5 block font-semibold" title="Подано раніше за інших">
            подано першим
          </span>
        )}
      </TableCell>

      <TableCell>
        {claim.status === 'CONFIRMED' && (
          <span className="font-medium text-success">Підтверджено</span>
        )}
        {claim.status === 'REJECTED' && (
          <div>
            <span className="font-medium text-error">Відхилено</span>
            {claim.rejectReason && <p>{claim.rejectReason}</p>}
          </div>
        )}

        {/* Everyone but ADMIN sees the state and no controls — a завідувач as
            well as a декан since 2026-08-25. The action refuses them anyway;
            this only stops offering a button that would fail. */}
        {claim.status === 'PENDING' && !canDecide && <span>На розгляді</span>}

        {claim.status === 'PENDING' && canDecide && !rejecting && (
          // **Stacked on purpose, and both the full width of the cell.** They
          // were a `flex-wrap` row, so at this column width they wrapped anyway
          // — and wrapping sizes each button to its own label, which left
          // «Підтвердити» visibly wider than «Відхилити» above it (owner,
          // 2026-09-21). Two controls of different widths read as two different
          // KINDS of control; they are the same kind, one accepting and one
          // refusing. A flex column stretches both to the cell, so the pair is
          // one block and the words are what differ.
          <div className="flex flex-col gap-1">
            {/* No `size="sm"`. That size is `text-[0.8rem]` — 12.8px, which is
                both small for the screen's primary action and off §4's even
                ladder. The default is `h-8` and `text-sm`. */}
            <Button variant="outline" disabled={pending} onClick={() => decide('CONFIRMED')}>
              <Check className="size-4" />
              Підтвердити
            </Button>
            {/* `destructive`, like every other «Відхилити» and «Архівувати» in
                the app — §3 of `docs/aurora.md`. It was `ghost`, which drew a
                refusal as the quietest control on the row. The `X` stays rather
                than the `Ban` the standalone discards use: this one is half of
                a Check/X pair, and the pair is the affordance. */}
            <Button variant="destructive" disabled={pending} onClick={() => setRejecting(true)}>
              <X className="size-4" />
              Відхилити
            </Button>
          </div>
        )}

        {claim.status === 'PENDING' && canDecide && rejecting && (
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
              <Button variant="destructive" disabled={pending} onClick={() => decide('REJECTED')}>
                Відхилити
              </Button>
              <Button
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

        {error && <p className="mt-1 text-error">{error}</p>}
      </TableCell>
    </TableRow>
  );
}

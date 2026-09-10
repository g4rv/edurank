'use client';

import { useActionState, useId, useState, useTransition } from 'react';
import { Button } from '@/components/aurora/ui/button';
import { Card } from '@/components/aurora/ui/card';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/aurora/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import {
  EMPTY_SELECTION,
  branchesOf,
  optionsFor,
  resolve,
  variantsOf,
  type Selection,
} from '@/lib/students/cascade';
import {
  STUDENT_DEGREE_LABELS as DEGREE,
  STUDENT_FUNDING_LABELS as FUNDING,
  STUDY_FORM_LABELS as FORM,
} from '@/lib/labels';
import type { RegisterSpeciality } from '@/lib/students/accepted';
import type { Candidate } from '@/lib/queries/list-admitted-students';
import {
  addStudentClaim,
  listStudentCandidates,
  type ClaimState,
} from '@/app/(dashboard)/achievements/students/actions';

/**
 * «Додати здобувача» — the five-step cascade, open on the page.
 *
 * **It was briefly a sheet behind a button** and went back (owner, 2026-09-10).
 * The argument for the button was that the list is what you come to read; the
 * argument against it won, and it is the stronger one: adding somebody is the
 * whole job of this screen, and a click whose only effect is to reveal a form
 * is a step that decides nothing. The reader sees the fields and starts.
 */
export function AddClaimForm({ register, year }: { register: RegisterSpeciality[]; year: number }) {
  const [state, formAction, pending] = useActionState<ClaimState, FormData>(addStudentClaim, null);
  // A new token means the last submit succeeded, so the fields remount empty.
  const token = state && 'success' in state ? state.token : 'new';

  return (
    <Card title={`Додати здобувача — ${year}`}>
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">
        Спочатку вкажіть умови вступу, потім оберіть здобувача зі списку зарахованих.
      </p>
      <form action={formAction}>
        <CascadeFields key={token} register={register} pending={pending} state={state} />
      </form>
    </Card>
  );
}

/**
 * Спеціальність → [спеціалізація] → ступінь · форма · фінансування → здобувач.
 *
 * Each step offers only values the register still has students under, and
 * anything with a single possible answer is filled in and locked rather than
 * asked. The names arrive from the server once the combination is complete —
 * see `listStudentCandidates` for why they are not shipped with the page. The
 * rules themselves are `lib/students/cascade.ts`, with tests.
 *
 * There is no факультет step: a claim does not record one, and «Психологія» is
 * taught on two of them, so asking split one speciality's students across two
 * lists that each looked complete.
 *
 * There is no free-text fallback anywhere here, on purpose: a student who is
 * not in the наказ cannot be claimed, and the fix for a missing one is to
 * import the updated list, not to let one person type a name nobody can check.
 */
function CascadeFields({
  register,
  pending,
  state,
}: {
  register: RegisterSpeciality[];
  pending: boolean;
  /**
   * The whole action state, not just its message — the OBJECT is what says
   * «this is a fresh answer», and two identical refusals in a row carry the
   * same string. See `dismissed` below.
   */
  state: ClaimState;
}) {
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [student, setStudent] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, startLoading] = useTransition();

  /**
   * **An error describes the form as it was WHEN IT WAS SENT** (owner,
   * 2026-09-10).
   *
   * «Ви вже додали цього здобувача на цю спеціальність» stayed on screen after
   * the спеціальність had been changed to a different one — so it accused a
   * combination that no longer existed, and the only way to clear it was to
   * submit again and hope. `useActionState` has no reset: its state lives until
   * the next call, and only a successful save remounts these fields.
   *
   * So the form remembers WHICH answer it has already dismissed, and every
   * field change dismisses the current one.
   *
   * **It holds the state object, not the message.** A new submit produces a new
   * object even when the sentence is identical, so identity is what makes a
   * second, same-worded refusal appear again rather than stay hidden — the
   * string alone could not tell the two apart.
   *
   * Set from the change handlers, which is the only place React allows it. An
   * effect would render the stale message once before clearing it, and both
   * `react-hooks/set-state-in-effect` and `react-hooks/refs` refuse the
   * shortcuts around that.
   */
  const [dismissed, setDismissed] = useState<ClaimState>(null);
  const error = state && 'error' in state && state !== dismissed ? state.error : null;

  const { speciality, branch, degree, form, funding } = selection;
  const branches = branchesOf(register, speciality);
  const chosen = branches.find((b) => b.speciality === branch);
  const variants = variantsOf(register, speciality, branch);

  const disabled = pending || loading;
  /** All three open together once the programme is known — none is a step after another */
  const termsClosed = disabled || variants.length === 0;

  /**
   * The names on offer, narrowed to the chosen ступінь.
   *
   * The server is asked for спеціальність, форма and фінансування — the ступінь
   * is not part of the register's key, so it is filtered here out of what came
   * back. Every candidate carries their own, which is what makes that possible
   * without a second round trip.
   */
  const visible = degree ? candidates.filter((c) => c.degree === degree) : candidates;

  /** Applies a change, resolves everything it settles, and loads the names if complete */
  function choose(next: Selection) {
    const resolved = resolve(register, next);
    setSelection(resolved);
    setStudent('');
    setDismissed(state);

    // Ступінь narrows what is already loaded, so it alone does not refetch.
    const sameQuery =
      resolved.branch === branch && resolved.form === form && resolved.funding === funding;
    if (sameQuery) return;

    setCandidates([]);
    if (!resolved.branch || !resolved.form || !resolved.funding) return;
    startLoading(async () => {
      setCandidates(
        await listStudentCandidates({
          speciality: resolved.branch,
          form: resolved.form as 'FULL_TIME' | 'PART_TIME',
          funding: resolved.funding as 'STATE' | 'CONTRACT',
        })
      );
    });
  }

  return (
    // **`@container`, not viewport breakpoints** (2026-09-10). This card is
    // full-width on a narrow window and two thirds of one beside the figures on
    // a wide one, so its width and the window's stopped agreeing the moment the
    // page grew a second column. A `lg:` rule measured the window and put two
    // long programme names side by side in 320px. Container queries ask the
    // card instead, which is the thing that actually has to hold the fields.
    <div className="@container space-y-4">
      <input type="hidden" name="speciality" value={branch} />
      <input type="hidden" name="form" value={form} />
      <input type="hidden" name="funding" value={funding} />
      <input type="hidden" name="studentName" value={student} />

      <div className="grid gap-4 @3xl:grid-cols-4">
        {/* The WHOLE university's list. An НПП may recruit onto any programme,
            and filtering this to their own кафедра would quietly make most of
            their work unclaimable. */}
        <div className="@3xl:col-span-2">
          <PickOne
            label="Спеціальність"
            value={speciality}
            onChange={(value) => choose({ ...EMPTY_SELECTION, speciality: value })}
            options={register.map((s) => ({
              value: s.name,
              label: s.code ? `${s.code} · ${s.name}` : s.name,
            }))}
            disabled={disabled}
          />
        </div>

        {/* **Always on screen** (owner, 2026-09-10). It used to be rendered only
            for a спеціальність that HAS спеціалізації, so the form was a
            different shape for «Середня освіта» than for «Професійна освіта»:
            the field appeared, the row reflowed, and the three selects below it
            jumped. §5's argument, one level up — a form is a shape, not a list,
            and a field that vanishes takes its LABEL with it, so «this
            programme has no спеціалізація» and «this app does not ask about
            спеціалізації» looked identical.

            A programme without one shows «Без спеціалізації», settled and
            locked, exactly as `PickOne` already treats any single answer.

            Side by side with «Спеціальність» only from `@3xl` (48rem) — below
            that the card cannot give two long names half a row each without
            truncating both. */}
        <div className="@3xl:col-span-2">
          <PickOne
            label="Спеціалізація"
            value={branch}
            onChange={(value) => choose({ ...selection, branch: value, form: '', funding: '' })}
            // `b.name` is null for a спеціальність with no спеціалізації, and
            // the label used to read «A5 · null» for one — invisible only
            // because the field was hidden in exactly that case.
            options={branches.map((b) => ({
              value: b.speciality,
              label: b.name ? (b.code ? `${b.code} · ${b.name}` : b.name) : 'Без спеціалізації',
            }))}
            disabled={disabled || !speciality}
          />
        </div>

        {/* Ступінь, форма and фінансування — three views of one set of variants.

            They were a chain: форма waited on the спеціальність, фінансування
            on the форма, and ступінь on the loaded names. So two of the three
            sat greyed after choosing a programme, looking like steps somebody
            had skipped. They describe the same admission from three sides, and
            all three are answerable the moment the programme is known — so all
            three open together, each offering what the other two still allow.

            Ступінь is a filter and is never SENT: the claim's ступінь is read
            from the register row addStudentClaim finds, exactly as before. It
            only decides which names are offered.

            Their own row, so the three read as one question asked three ways
            rather than as three more steps after the programme. */}
        <div className="grid gap-4 @xl:grid-cols-3 @3xl:col-span-4">
          <PickOne
            label="Ступінь"
            value={degree}
            onChange={(value) => choose({ ...selection, degree: value })}
            options={optionsFor(variants, selection, 'degree').map((d) => ({
              value: d,
              label: DEGREE[d as keyof typeof DEGREE],
            }))}
            disabled={termsClosed}
          />

          <PickOne
            label="Форма навчання"
            value={form}
            onChange={(value) => choose({ ...selection, form: value })}
            options={optionsFor(variants, selection, 'form').map((f) => ({
              value: f,
              label: FORM[f as keyof typeof FORM],
            }))}
            disabled={termsClosed}
          />

          <PickOne
            label="Фінансування"
            value={funding}
            onChange={(value) => choose({ ...selection, funding: value })}
            options={optionsFor(variants, selection, 'funding').map((f) => ({
              value: f,
              label: FUNDING[f as keyof typeof FUNDING],
            }))}
            disabled={termsClosed}
          />
        </div>

        {/* **The last field and the button share a row** (owner, 2026-09-10).
            The button sat on a line of its own under the whole grid, which made
            it look like a fifth step rather than the end of the fourth — and it
            was the width of the word «Додати», stranded at the left edge under
            a full-width field.

            `items-end`, so the button's bottom edge meets the field's: the
            field carries a label above it and the button does not, so aligning
            anything but the bottoms leaves them off by the label's height. */}
        <div className="@3xl:col-span-4">
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <StudentPicker
                candidates={visible}
                value={student}
                onChange={(value) => {
                  setStudent(value);
                  setDismissed(state);
                }}
                ready={Boolean(funding)}
                loading={loading}
                disabled={pending}
              />
            </div>
            {/* «Додати здобувача», not «Додати». On its own line the bare verb
                took its object from the card title above it; on a row beside a
                field it needs to carry its own. */}
            <Button type="submit" disabled={disabled || !student} className="shrink-0">
              {pending ? 'Збереження…' : 'Додати здобувача'}
            </Button>
          </div>

          <FormMessage error={error} departments={chosen?.departments ?? []} />
        </div>
      </div>
    </div>
  );
}

/**
 * ONE reserved line under the student picker, holding whichever message applies.
 *
 * **Two stacked slots were too much** (owner, 2026-09-10). The кафедра and a
 * submit error each had their own reserved line in a block after the whole
 * grid: 40px of height plus the 16px of `space-y-4` above it, so an untouched
 * form carried 56px of blank between the last field and the card's own padding.
 * More dead space than the padding it sat next to.
 *
 * They share a slot now, 20px — the taller of the two, `text-sm`'s line — and
 * it sits directly under the field rather than under the grid, where 4px of
 * `mt-1` replaces the 16px gap. Reserved either way, so the card never changes
 * height while somebody fills it in and the claims list below never moves.
 *
 * **The error wins when both could show**, which is the ordinary hint-then-error
 * behaviour of any form field: the кафедра is context you may already have read,
 * the error is the thing standing between you and a saved claim.
 *
 * **Both are `text-sm`** (owner, 2026-09-10). The кафедра was `text-xs` and the
 * error `text-sm`, so one slot changed type size depending on what was in it.
 * A message slot has ONE type style and lets colour carry the difference —
 * muted for context, `--destructive` for a refusal. The size is set by the more
 * important of the two: the app's shared `FieldError` is `text-sm`, and an
 * error nobody reads is worse than a кафедра line a step louder than §4 would
 * pick for meta on its own.
 */
function FormMessage({
  error,
  departments,
}: {
  error: string | null;
  departments: readonly string[];
}) {
  const kafedra = departments.length > 0 ? departments.join(' · ') : null;

  return (
    <div className="mt-1 min-h-5">
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        kafedra && (
          // The кафедра is not in the наказ — this is the випускова кафедра of
          // the programme, which is what tells a завідувач whether the student
          // went onto their own кафедра's programme or somebody else's. Right
          // above «Додати здобувача» it doubles as the last check before the
          // click.
          //
          // Shown with NO label at all (owner, 2026-08-18). Every name in
          // `SPECIALITY_DEPARTMENTS` already begins with the word «Кафедра», so
          // any prefix read as «Кафедра: Кафедра політології та журналістики».
          // «Випускова» went too: it names a distinction only the завідувач's
          // review screen actually draws, and the НПП filling this in has
          // exactly one кафедра in mind — the one that teaches the programme.
          //
          // `truncate`, so a спеціальність taught by three кафедри cannot wrap
          // onto a second line and defeat the reserved height.
          <p className="truncate text-sm text-muted-foreground" title={kafedra}>
            {kafedra}
          </p>
        )
      )}
    </div>
  );
}

/** Searchable, because one combination can hold a few dozen people */
function StudentPicker({
  candidates,
  value,
  onChange,
  ready,
  loading,
  disabled,
}: {
  candidates: Candidate[];
  value: string;
  onChange: (value: string) => void;
  /** All four criteria are chosen */
  ready: boolean;
  loading: boolean;
  disabled: boolean;
}) {
  const items = candidates.map((c) => ({ id: c.name, name: c.name }));
  // The placeholder still carries the STATE — «not yet», «loading», «N to pick
  // from» — because that changes as the form is filled and a fixed label cannot
  // say it. The label above says what the field is.
  const placeholder = !ready
    ? 'Спочатку вкажіть умови вступу'
    : loading
      ? 'Завантаження…'
      : `Почніть вводити прізвище (${candidates.length})`;

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      filter={(item, q) => item.name.toLowerCase().includes(q.toLowerCase())}
      displayValue={value}
      disabled={disabled || !ready || loading}
    >
      <p className="mb-1 block text-xs font-medium text-muted-foreground">Здобувач</p>
      <ComboboxInput placeholder={placeholder} aria-label="Здобувач" />
      <ComboboxContent>
        <ComboboxEmpty>Здобувача не знайдено</ComboboxEmpty>
        <ComboboxList<{ id: string; name: string }>>
          {(item) => (
            <ComboboxItem key={item.id} value={item.id}>
              {item.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * One select, with its name above it rather than only inside it.
 *
 * The label used to live in the placeholder alone, which meant it vanished the
 * moment somebody chose something: a filled form read «B11 · Філологія» /
 * «B11 · Переклад» / «Бакалавр» with nothing saying which field was which
 * (owner, 2026-08-18). Placeholders are a hint, not a label — and this form has
 * five of them in a row, two of which hold near-identical values.
 *
 * **A single option is shown, already chosen, and cannot be changed.** `resolve`
 * has filled it in by then, so the select is only reporting what the register
 * left no choice about. Kept visible rather than hidden: «Заочна» is part of
 * what the person is claiming, and a field that disappears is one they cannot
 * check before pressing «Додати».
 */
function PickOne({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled: boolean;
}) {
  const id = useId();
  const settled = options.length === 1 && value !== '';

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled || settled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Оберіть…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

'use client';

import { useActionState, useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatBonus } from '@/lib/stake/units';
import { cn } from '@/lib/utils';
import type { MyClaim } from '@/lib/queries/list-student-claims';
import type { RegisterBranch, RegisterSpeciality } from '@/lib/students/accepted';
import {
  addStudentClaim,
  deleteStudentClaim,
  listStudentCandidates,
  type ClaimState,
} from '@/app/(dashboard)/achievements/students/actions';

const DEGREE = { BACHELOR: 'Бакалавр', MASTER: 'Магістр' } as const;
const FORM = { FULL_TIME: 'Денна', PART_TIME: 'Заочна' } as const;
const FUNDING = { STATE: 'Бюджет', CONTRACT: 'Контракт' } as const;

const STATUS = {
  PENDING: { label: 'На розгляді', className: 'text-muted-foreground' },
  CONFIRMED: {
    label: 'Підтверджено',
    className: 'text-emerald-700 dark:text-emerald-400',
  },
  REJECTED: { label: 'Відхилено', className: 'text-destructive' },
} as const;

/**
 * «Мої залучені здобувачі».
 *
 * The person is **never told about a conflict**. If a colleague has claimed the
 * same student, nothing here says so and nothing is blocked — the duplicate is
 * shown only to the завідувач, who is the one who can judge it. Blocking or
 * warning would hand the ставка to whoever typed first rather than to whoever
 * did the work.
 *
 * That is why the total is labelled as POSSIBLE. It is what these students
 * would be worth if every claim is confirmed, and some of them may not be.
 */
export function MyClaims({
  claims,
  potential,
  confirmed,
  register,
  year,
  canAdd,
}: {
  claims: MyClaim[];
  potential: number;
  confirmed: number;
  /** The admitted-students register, as a спеціальність → спеціалізація → умови tree */
  register: RegisterSpeciality[];
  year: number;
  /** False once the rating year is closed */
  canAdd: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-xl border bg-card px-5 py-4">
        {/* «Можливе збільшення ставки» until 2026-08-17 — a label that named an
            increase nobody had granted. These two say what they actually are:
            everything filed, and the part the завідувач has agreed is real. */}
        <div>
          <p className="text-2xl font-semibold tabular-nums">{formatBonus(potential)}</p>
          <p className="text-xs text-muted-foreground">Усього за заявками</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
            {formatBonus(confirmed)}
          </p>
          <p className="text-xs text-muted-foreground">Підтверджено завідувачем</p>
        </div>
        {/* What this page may and may not promise (2026-08-17). Recruitment is
            settled in a SECOND phase, months after the main розподіл: the
            проректор raises the кафедра's pool and the завідувач hands out the
            increase by hand. So a confirmed здобувач is an argument, not an
            amount owed — somebody with no room may get nothing, and that is a
            conversation, not a calculation. The page said «виплачується понад
            виділені кафедрі ставки» until then, which promised money the grid
            never paid. */}
        <p className="max-w-md text-xs text-muted-foreground">
          Спершу завідувач кафедри підтверджує здобувача. Підтверджені здобувачі враховуються на
          <strong className="font-medium"> 2 етапі розподілу ставок</strong>, який відбувається
          пізніше — рішення про надбавку ухвалює завідувач разом з адміністрацією.
        </p>
      </div>

      {canAdd && <AddClaimForm register={register} year={year} />}

      <ClaimsTable claims={claims} canDelete={canAdd} />
    </div>
  );
}

function AddClaimForm({ register, year }: { register: RegisterSpeciality[]; year: number }) {
  const [state, formAction, pending] = useActionState<ClaimState, FormData>(addStudentClaim, null);
  const error = state && 'error' in state ? state.error : null;
  // A new token means the last submit succeeded, so the fields remount empty.
  const token = state && 'success' in state ? state.token : 'new';

  return (
    <form action={formAction} className="space-y-3 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold">Додати здобувача — {year}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Спочатку вкажіть умови вступу, потім оберіть здобувача зі списку зарахованих.
        </p>
      </div>

      <CascadeFields key={token} register={register} pending={pending} error={error} />
    </form>
  );
}

/** What the four selects hold. `branch` is the FULL speciality name — what is claimed. */
interface Selection {
  speciality: string;
  branch: string;
  form: string;
  funding: string;
}

const EMPTY: Selection = { speciality: '', branch: '', form: '', funding: '' };

const unique = <T,>(values: T[]): T[] => [...new Set(values)];

function branchesOf(register: RegisterSpeciality[], speciality: string) {
  return register.find((s) => s.name === speciality)?.branches ?? [];
}

function formsOf(branches: readonly RegisterBranch[], branch: string) {
  const variants = branches.find((b) => b.speciality === branch)?.variants ?? [];
  return unique(variants.map((v) => v.form));
}

function fundingsOf(branches: readonly RegisterBranch[], branch: string, form: string) {
  const variants = branches.find((b) => b.speciality === branch)?.variants ?? [];
  return unique(variants.filter((v) => v.form === form).map((v) => v.funding));
}

/**
 * Fills in every level that has only one possible answer.
 *
 * A select with one option is a click that decides nothing, and it hides the
 * real question behind it — «Філологія» has exactly one спеціалізація, and
 * plenty of specialities were only offered денна, or only on контракт. Resolving
 * runs downward and cascades: choosing a speciality can settle the
 * спеціалізація, which settles the форма, which settles the фінансування, and
 * the candidate list loads straight away.
 */
function resolve(register: RegisterSpeciality[], selection: Selection): Selection {
  const branches = branchesOf(register, selection.speciality);

  const branch = selection.branch || (branches.length === 1 ? branches[0]!.speciality : '');
  if (!branch) return { ...selection, branch: '', form: '', funding: '' };

  const forms = formsOf(branches, branch);
  const form = selection.form || (forms.length === 1 ? forms[0]! : '');
  if (!form) return { ...selection, branch, form: '', funding: '' };

  const fundings = fundingsOf(branches, branch, form);
  const funding = selection.funding || (fundings.length === 1 ? fundings[0]! : '');

  return { ...selection, branch, form, funding };
}

/**
 * Спеціальність → [спеціалізація] → форма → фінансування → здобувач.
 *
 * Each step offers only values the register still has students under, and
 * clears every step below it, so a half-changed combination can never be
 * submitted. Anything with a single possible answer is filled in and locked
 * rather than asked. The names arrive from the server once the combination is
 * complete — see `listStudentCandidates` for why they are not shipped with the
 * page.
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
  error,
}: {
  register: RegisterSpeciality[];
  pending: boolean;
  error: string | null;
}) {
  const [selection, setSelection] = useState<Selection>(EMPTY);
  const [student, setStudent] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [loading, startLoading] = useTransition();

  const { speciality, branch, form, funding } = selection;
  const branches = branchesOf(register, speciality);
  // One unnamed branch means the спеціальність has no спеціалізації at all.
  const hasSpecialisations = branches.some((b) => b.name !== null);
  const chosen = branches.find((b) => b.speciality === branch);
  const forms = formsOf(branches, branch);
  const fundings = fundingsOf(branches, branch, form);

  const disabled = pending || loading;

  /** Applies a change, resolves everything it settles, and loads the names if complete */
  function choose(next: Selection) {
    const resolved = resolve(register, next);
    setSelection(resolved);
    setStudent('');
    setCandidates([]);

    if (!resolved.funding) return;
    startLoading(async () => {
      const names = await listStudentCandidates({
        speciality: resolved.branch,
        form: resolved.form as 'FULL_TIME' | 'PART_TIME',
        funding: resolved.funding as 'STATE' | 'CONTRACT',
      });
      setCandidates(names);
    });
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="speciality" value={branch} />
      <input type="hidden" name="form" value={form} />
      <input type="hidden" name="funding" value={funding} />
      <input type="hidden" name="studentName" value={student} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* The WHOLE university's list. An НПП may recruit onto any programme,
            and filtering this to their own кафедра would quietly make most of
            their work unclaimable. */}
        <div className="lg:col-span-2">
          <PickOne
            label="Спеціальність"
            value={speciality}
            onChange={(value) => choose({ ...EMPTY, speciality: value })}
            options={register.map((s) => ({
              value: s.name,
              label: s.code ? `${s.code} · ${s.name}` : s.name,
            }))}
            disabled={disabled}
          />
        </div>

        {hasSpecialisations && (
          <div className="lg:col-span-2">
            <PickOne
              label="Спеціалізація"
              value={branch}
              onChange={(value) => choose({ ...selection, branch: value, form: '', funding: '' })}
              options={branches.map((b) => ({
                value: b.speciality,
                label: b.code ? `${b.code} · ${b.name}` : (b.name ?? b.speciality),
              }))}
              disabled={disabled || !speciality}
            />
          </div>
        )}

        {/* Ступінь — fixed to бакалавр, and SHOWN rather than left out.

            Every one of the 722 people in the 2026 наказ is a бакалавр, so this
            filters nothing today and the field could be dropped. It is here
            because its absence would be read as «the app cannot do магістри»,
            which is untrue in a way that matters: the норматив for a магістр is
            already in `lib/stake/norms.ts` (their coefficient halves), the
            import script already reads the column, and the day a наказ for
            магістри arrives this becomes live with no code change.

            Disabled rather than a single-option select, so it reads as a
            constraint on the data rather than a control somebody failed to
            fill in. The line underneath says whose constraint it is. */}
        {/* The three narrow ones travel together — «Спеціалізація» appears only
            for some programmes, and without this «Фінансування» was left
            stranded on a row of its own whenever it did not. */}
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3 lg:col-span-4">
          <div>
            <PickOne
              label="Ступінь"
              value="BACHELOR"
              onChange={() => {}}
              options={[
                { value: 'BACHELOR', label: DEGREE.BACHELOR },
                { value: 'MASTER', label: DEGREE.MASTER },
              ]}
              disabled
            />
            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
              У наказі 2026 року лише бакалаври
            </p>
          </div>

          <PickOne
            label="Форма навчання"
            value={form}
            onChange={(value) => choose({ ...selection, form: value, funding: '' })}
            options={forms.map((f) => ({ value: f, label: FORM[f] }))}
            disabled={disabled || !branch}
          />

          <PickOne
            label="Фінансування"
            value={funding}
            onChange={(value) => choose({ ...selection, funding: value })}
            options={fundings.map((f) => ({ value: f, label: FUNDING[f] }))}
            disabled={disabled || !form}
          />
        </div>

        {/* Its own row: the three narrow selects above now fill one, and the
            student search is the widest thing on the form. */}
        <div className="sm:col-span-2 lg:col-span-4">
          <StudentPicker
            candidates={candidates}
            value={student}
            onChange={setStudent}
            ready={Boolean(funding)}
            loading={loading}
            disabled={pending}
          />
        </div>
      </div>

      {/* The кафедра is not in the наказ — this is the випускова кафедра of the
          programme, which is what tells a завідувач whether the student went
          onto their own кафедра's programme or somebody else's. */}
      {chosen && chosen.departments.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {chosen.departments.length > 1 ? 'Випускові кафедри: ' : 'Випускова кафедра: '}
          {chosen.departments.join(' · ')}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={disabled || !student}>
        {pending ? 'Збереження…' : 'Додати'}
      </Button>
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
  candidates: string[];
  value: string;
  onChange: (value: string) => void;
  /** All four criteria are chosen */
  ready: boolean;
  loading: boolean;
  disabled: boolean;
}) {
  const items = candidates.map((name) => ({ id: name, name }));
  const placeholder = !ready
    ? 'Спочатку вкажіть умови вступу'
    : loading
      ? 'Завантаження…'
      : `Здобувач (${candidates.length})`;

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      filter={(item, q) => item.name.toLowerCase().includes(q.toLowerCase())}
      displayValue={value}
      disabled={disabled || !ready || loading}
    >
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
 * A single option is shown, already chosen, and cannot be changed.
 *
 * `resolve` has filled it in by then, so the select is only reporting what the
 * register left no choice about. Kept visible rather than hidden: «Заочна» is
 * part of what the person is claiming, and a field that disappears is one they
 * cannot check before pressing «Додати».
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
  const settled = options.length === 1 && value !== '';

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || settled}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ClaimsTable({ claims, canDelete }: { claims: MyClaim[]; canDelete: boolean }) {
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteStudentClaim(id);
      if (result && 'error' in result) toast.error(result.error);
      else toast.success('Видалено');
    });
  }

  if (claims.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        Ви ще не додали жодного здобувача за цей рік.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/60 text-left">
            <th className="border border-border px-3 py-2 font-medium text-muted-foreground">
              Здобувач
            </th>
            <th className="border border-border px-3 py-2 font-medium text-muted-foreground">
              Спеціальність
            </th>
            <th className="w-44 border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground">
              Рівень / форма
            </th>
            <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
              Ставка
            </th>
            <th className="w-32 border border-border px-3 py-2 font-medium text-muted-foreground">
              Стан
            </th>
            {canDelete && <th className="w-12 border border-border px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id} className="transition-colors hover:bg-muted/20">
              <td className="border border-border px-3 py-2">{claim.studentName}</td>
              <td className="border border-border px-3 py-2 text-muted-foreground">
                {claim.speciality}
              </td>
              <td className="border border-border px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                {DEGREE[claim.degree]} · {FORM[claim.form]} · {FUNDING[claim.funding]}
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
              <td className="border border-border px-3 py-2">
                <span className={cn('text-xs font-medium', STATUS[claim.status].className)}>
                  {STATUS[claim.status].label}
                </span>
                {claim.status === 'REJECTED' && claim.rejectReason && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{claim.rejectReason}</p>
                )}
              </td>
              {canDelete && (
                <td className="border border-border px-3 py-2 text-center">
                  {/* Only while nobody has ruled on it: once confirmed the bonus
                      is part of a distribution somebody has worked on. */}
                  {claim.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => remove(claim.id)}
                      disabled={pending}
                      aria-label={`Видалити ${claim.studentName}`}
                      title="Видалити"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

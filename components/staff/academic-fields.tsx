'use client';

import {
  Controller,
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { useState, type ReactNode } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EMPTY_DEGREE_ROW,
  type AcademicFormValues,
  diplomaProblems,
  type DegreeFormRow,
} from '@/components/staff/academic-form-values';
import { Card } from '@/components/aurora/ui/card';
import { CertificateFields } from '@/components/staff/certificate-fields';
import type {
  CertificateScans,
  CertificatesFormValues,
} from '@/components/staff/certificate-form-values';
import { DateInput } from '@/components/aurora/ui/date-input';
import { todayInKyiv } from '@/validations/qualification';
import { Input } from '@/components/aurora/ui/input';
import { Button } from '@/components/aurora/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/aurora/ui/dialog';
import { Checkbox } from '@/components/aurora/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { RatingFieldHint } from '@/components/staff/rating-field-hint';
import { BadgePicker } from '@/components/staff/badge-picker';
import { CARD_TITLES } from '@/components/staff/profile/cards';
import { ACADEMIC_TITLE_LABELS, ADMIN_POSITION_LABELS, STAFF_POSITION_LABELS } from '@/lib/labels';
import { offeredAdminPositions, type HeadshipPost } from '@/lib/staff/academic';
import type { AdminPosition } from '@/lib/generated/prisma/client';
import {
  BASIC_DEGREES,
  CANDIDATE_DEGREES,
  DOCTOR_DEGREES,
  HONORARY_TITLES,
  BASIC_LEVELS,
  degreeLevel,
  degreeTitle,
  diplomaDocument,
  isUnspecifiedDegree,
} from '@/lib/staff/academic-options';

/**
 * «Академічна інформація» and «Освіта» (owner, 2026-10-06), written once for
 * both forms that edit them: the staff record (`StaffFormFields`, ADMIN and
 * granted editors) and the НПП's own profile (`ProfileEditForm`). Both forms
 * hold these values under the same names, so both hand their own `control`
 * over cast to this shape.
 */

/** A two-column row whose labels line up — see the note in StaffFormFields */
export const FIELD_ROW = cn(
  'grid grid-cols-2 gap-x-4 gap-y-2',
  '[&>[data-slot=field]]:grid [&>[data-slot=field]]:grid-rows-subgrid [&>[data-slot=field]]:row-span-3 [&>[data-slot=field]]:gap-0',
  '[&_[data-slot=field-label]]:self-end'
);

interface CardProps {
  register: UseFormRegister<AcademicFormValues>;
  control: Control<AcademicFormValues>;
  errors: FieldErrors<AcademicFormValues>;
  isPending: boolean;
  /** A field outside what this viewer may write — greyed, still readable */
  locked?: (field: keyof AcademicFormValues) => boolean;
  className?: string;
  action?: React.ReactNode;
  /**
   * The post a кафедра or факультет gives this person by naming them — counted
   * by itself, never picked (owner, 2026-10-06). Null on a new profile.
   */
  headship?: HeadshipPost | null;
}

/**
 * Rating 1.2 is «Вчене звання» in the order, and its list mixes звання and
 * посади — so both fields feed it, the higher counting (`ratingRank`). Said on
 * both, because the rating line reading «Вчене звання: старший викладач» beside
 * an empty вчене звання looked like a mistake (owner, 2026-10-06).
 */
const RANK_NOTE = 'Зараховується вчене звання професора або доцента, а якщо його немає — посада';

const HEADSHIP_NOTE: Record<HeadshipPost, string> = {
  DEPARTMENT_HEAD: 'Завідувач кафедри — зараховано автоматично',
  DEAN: 'Декан — зараховано автоматично',
};

const entries = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/** A single-choice select with «—» for none, as the rest of the form draws them */
function PlainSelect({
  id,
  value,
  onChange,
  options,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  disabled: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value=" ">—</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AcademicCard({
  register,
  control,
  errors,
  isPending,
  locked = () => false,
  className,
  action,
  headship = null,
}: CardProps) {
  return (
    <Card title={CARD_TITLES.academic} action={action} className={className}>
      <FieldGroup className={FIELD_ROW}>
        <FormField
          label="Посада"
          htmlFor="position"
          labelSuffix={<RatingFieldHint field="academicRank" note={RANK_NOTE} />}
          error={errors.position}
        >
          <Controller
            name="position"
            control={control}
            render={({ field }) => (
              <PlainSelect
                id="position"
                value={field.value}
                onChange={field.onChange}
                options={entries(STAFF_POSITION_LABELS)}
                disabled={isPending || locked('position')}
              />
            )}
          />
        </FormField>
        <FormField
          label="Вчене звання"
          htmlFor="academicTitle"
          labelSuffix={<RatingFieldHint field="academicRank" note={RANK_NOTE} />}
          error={errors.academicTitle}
        >
          <Controller
            name="academicTitle"
            control={control}
            render={({ field }) => (
              <PlainSelect
                id="academicTitle"
                value={field.value}
                onChange={field.onChange}
                options={entries(ACADEMIC_TITLE_LABELS)}
                disabled={isPending || locked('academicTitle')}
              />
            )}
          />
        </FormField>
        <FormField
          htmlFor="pedagogicalExperience"
          label="Науково-педагогічний стаж (років)"
          labelSuffix={<RatingFieldHint field="pedagogicalExperience" />}
          error={errors.pedagogicalExperience}
        >
          <Input
            id="pedagogicalExperience"
            type="number"
            min="0"
            placeholder="12"
            disabled={isPending || locked('pedagogicalExperience')}
            {...register('pedagogicalExperience')}
          />
        </FormField>
        <div />
      </FieldGroup>

      {/* Lists of badges take the full width — a person may hold several, and
          half a card squeezed «Заслужений працівник фізичної культури і спорту
          України» into three lines. */}
      <FieldGroup className="mt-4 flex flex-col gap-4">
        <FormField
          label="Почесні звання"
          htmlFor="honoraryTitles"
          error={errors.honoraryTitles as never}
        >
          <Controller
            name="honoraryTitles"
            control={control}
            render={({ field }) => (
              <BadgePicker
                id="honoraryTitles"
                options={HONORARY_TITLES}
                value={field.value}
                onChange={field.onChange}
                disabled={isPending || locked('honoraryTitles')}
                addLabel="Додати почесне звання…"
              />
            )}
          />
        </FormField>
        {/* Several posts, one leading one at most, and a проректор holds
            nothing else (owner, 2026-10-06). The list offers only what can go
            with what is already there; the schema and the save refuse the rest. */}
        <FormField
          label="Адміністративні посади"
          htmlFor="adminPositions"
          labelSuffix={<RatingFieldHint field="adminPosition" />}
          description={headship ? HEADSHIP_NOTE[headship] : undefined}
          error={errors.adminPositions as never}
        >
          <Controller
            name="adminPositions"
            control={control}
            render={({ field }) => (
              <BadgePicker
                id="adminPositions"
                options={entries(ADMIN_POSITION_LABELS)}
                offered={offeredAdminPositions(field.value as AdminPosition[], headship)}
                value={field.value}
                onChange={field.onChange}
                disabled={isPending || locked('adminPositions')}
                addLabel="Додати посаду…"
              />
            )}
          />
        </FormField>
      </FieldGroup>
    </Card>
  );
}

/** «15.03.2021» from the stored «2021-03-15» */
const uaDay = (iso: string) => iso.split('-').reverse().join('.');

/**
 * One diploma as a card: the ступінь on the first line, then speciality, date
 * and «відповідає кафедрі» on one (owner, 2026-10-10 — a list of cards, the
 * fields themselves in a popup). A blank part is left out, not shown as «—».
 */
function DegreeCard({
  row,
  onEdit,
  onRemove,
  disabled,
}: {
  row: DegreeFormRow;
  onEdit: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const placeholder = isUnspecifiedDegree(row.degree);
  const document = diplomaDocument(row);
  const detail = [row.specialty.trim(), row.defenceDate ? uaDay(row.defenceDate) : ''].filter(
    Boolean
  );
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/30 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{degreeTitle(row.degree, row.basicLevel)}</p>
        {row.topic.trim() && (
          <p className="mt-0.5 text-sm text-foreground-soft">Тема: {row.topic.trim()}</p>
        )}
        {(detail.length > 0 || row.matchesDepartment === 'true') && (
          <p className="mt-0.5 text-sm text-foreground-soft">
            {detail.join(' – ')}
            {detail.length > 0 && row.matchesDepartment === 'true' && ' – '}
            {row.matchesDepartment === 'true' && (
              <span className="inline-flex items-center gap-1">
                відповідає кафедрі
                <Check className="size-3.5 text-success" aria-hidden />
              </span>
            )}
          </p>
        )}
        {document && <p className="mt-0.5 text-sm text-foreground-soft">{document}</p>}
        {placeholder && <p className="mt-0.5 text-xs text-warning">Оберіть точний ступінь</p>}
        {Object.keys(diplomaProblems(row)).length > 0 && (
          <p className="mt-0.5 text-xs text-warning">Заповніть усі поля диплома</p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Редагувати освіту"
        disabled={disabled}
        onClick={onEdit}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Прибрати освіту"
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

/**
 * The four fields of one diploma, in a popup. It edits a LOCAL draft and hands
 * it back with «Готово»: nothing reaches the form — let alone the database —
 * until then, and Скасувати leaves the card as it was.
 *
 * Not a nested `<form>`: the popup renders in a portal, outside the staff form,
 * and its buttons are `type="button"` so nothing in it can submit that form.
 */
type DegreeDialogState = { index: number | null; row: DegreeFormRow };

function DegreeDialog({
  state,
  onClose,
  onDone,
}: {
  /** `index` null = a new diploma; null state = closed */
  state: DegreeDialogState | null;
  onClose: () => void;
  onDone: (index: number | null, row: DegreeFormRow) => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && onClose()}>
      {/* No auto-focus: the first control is the rating hint's «i», and focusing it
          opened its tooltip over the popup the moment it appeared. */}
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        {/* Mounted only while open, so the draft starts fresh each time — from
            the card being edited, or blank — with no effect to copy it in. */}
        {state && <DegreeDialogForm state={state} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function DegreeDialogForm({
  state,
  onClose,
  onDone,
}: {
  state: DegreeDialogState;
  onClose: () => void;
  onDone: (index: number | null, row: DegreeFormRow) => void;
}) {
  const [draft, setDraft] = useState<DegreeFormRow>(state.row);
  // Every field but «відповідає кафедрі» is mandatory (owner, 2026-10-15); a problem
  // clears as its field is touched.
  const [problems, setProblems] = useState<Partial<Record<keyof DegreeFormRow, string>>>({});
  const err = (key: keyof DegreeFormRow) =>
    problems[key] ? { message: problems[key]! } : undefined;
  const clear = (key: keyof DegreeFormRow) => setProblems(({ [key]: _gone, ...rest }) => rest);

  const set = (patch: Partial<DegreeFormRow>) => {
    setDraft((d) => ({ ...d, ...patch }));
    for (const key of Object.keys(patch)) clear(key as keyof DegreeFormRow);
    // The issue date is judged against the defence date, so moving one clears both.
    if ('defenceDate' in patch) clear('issueDate');
  };
  const placeholder = isUnspecifiedDegree(draft.degree);
  // The basic education is an entry of the same list (owner, 2026-10-14), one kind.
  // It is judged by rating 1.9, not 1.3, and its date is the diploma's issue date,
  // not a defence. Since 2026-10-15 it also says which diploma it is — бакалавр,
  // спеціаліст or магістр — for the record only.
  const isBasic = degreeLevel(draft.degree) === 'basic';
  const isDegree = !!draft.degree && !isBasic;

  function done() {
    const found = diplomaProblems(draft);
    if (Object.keys(found).length > 0) {
      setProblems(found);
      return;
    }
    // Drop what does not belong to the kind, so a switch of kind leaves nothing behind.
    onDone(state.index, {
      ...draft,
      basicLevel: isBasic ? draft.basicLevel : '',
      topic: isBasic ? '' : draft.topic,
      issueDate: isBasic ? '' : draft.issueDate,
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{state.index === null ? 'Додати освіту' : 'Редагувати освіту'}</DialogTitle>
        <DialogDescription>
          Усі поля обов’язкові, окрім відповідності спеціальності кафедри.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <FieldGroup className="flex flex-col gap-4">
          <FormField
            label="Рівень освіти / Науковий ступінь"
            htmlFor="degree-dialog-degree"
            labelSuffix={
              <RatingFieldHint field={isBasic ? 'basicEducationMatch' : 'scientificDegree'} />
            }
            required
            error={err('degree')}
          >
            <Select
              value={placeholder ? '' : draft.degree || ' '}
              onValueChange={(v) => set({ degree: v === ' ' ? '' : v })}
            >
              <SelectTrigger id="degree-dialog-degree" className="w-full">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">—</SelectItem>
                {BASIC_DEGREES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
                <SelectGroup>
                  <SelectLabel>Доктор наук</SelectLabel>
                  {DOCTOR_DEGREES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Кандидат наук / PhD</SelectLabel>
                  {CANDIDATE_DEGREES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {placeholder && (
              <p className="mt-1 text-xs text-warning">Оберіть точний науковий ступінь</p>
            )}
          </FormField>
          {isBasic && (
            <FormField
              label="Рівень освіти"
              htmlFor="degree-dialog-level"
              required
              error={err('basicLevel')}
            >
              <Select value={draft.basicLevel} onValueChange={(v) => set({ basicLevel: v })}>
                <SelectTrigger id="degree-dialog-level" className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {BASIC_LEVELS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <FormField
            htmlFor="degree-dialog-specialty"
            label="Спеціальність за дипломом"
            required
            error={err('specialty')}
          >
            <Input
              id="degree-dialog-specialty"
              value={draft.specialty}
              onChange={(e) => set({ specialty: e.target.value })}
            />
          </FormField>
          {isDegree && (
            <FormField
              htmlFor="degree-dialog-topic"
              label="Тема наукової роботи"
              required
              error={err('topic')}
            >
              <Input
                id="degree-dialog-topic"
                value={draft.topic}
                maxLength={500}
                onChange={(e) => set({ topic: e.target.value })}
              />
            </FormField>
          )}
          <FormField
            label={isBasic ? 'Дата видачі диплома' : 'Дата захисту'}
            htmlFor="degree-dialog-date"
            required
            error={err('defenceDate')}
          >
            <DateInput
              id="degree-dialog-date"
              value={draft.defenceDate}
              onChange={(v) => set({ defenceDate: v ?? '' })}
              min="1950-01-01"
              max={todayInKyiv()}
              aria-invalid={!!problems.defenceDate}
            />
          </FormField>
          {isDegree && (
            <FormField
              htmlFor="degree-dialog-issue-date"
              label="Дата видачі диплома"
              required
              error={err('issueDate')}
            >
              <DateInput
                id="degree-dialog-issue-date"
                value={draft.issueDate}
                onChange={(v) => set({ issueDate: v ?? '' })}
                min="1950-01-01"
                max={todayInKyiv()}
              />
            </FormField>
          )}
          {draft.degree && (
            <>
              <FormField
                htmlFor="degree-dialog-issued-by"
                label="Ким виданий"
                required
                error={err('issuedBy')}
              >
                <Input
                  id="degree-dialog-issued-by"
                  value={draft.issuedBy}
                  maxLength={200}
                  onChange={(e) => set({ issuedBy: e.target.value })}
                />
              </FormField>
              <div className={FIELD_ROW}>
                <FormField htmlFor="degree-dialog-series" label="Серія">
                  <Input
                    id="degree-dialog-series"
                    value={draft.series}
                    maxLength={30}
                    onChange={(e) => set({ series: e.target.value })}
                  />
                </FormField>
                <FormField
                  htmlFor="degree-dialog-number"
                  label="Номер"
                  required
                  error={err('number')}
                >
                  <Input
                    id="degree-dialog-number"
                    value={draft.number}
                    maxLength={50}
                    onChange={(e) => set({ number: e.target.value })}
                  />
                </FormField>
              </div>
            </>
          )}
          <div className="flex items-center gap-1.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <Checkbox
                checked={draft.matchesDepartment === 'true'}
                onCheckedChange={(checked) =>
                  set({ matchesDepartment: checked === true ? 'true' : '' })
                }
              />
              Відповідає спеціальності кафедри
            </label>
            <RatingFieldHint field={isBasic ? 'basicEducationMatch' : 'degreeMatchesDepartment'} />
          </div>
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Скасувати
        </Button>
        <Button type="button" onClick={done}>
          {state.index === null ? 'Додати' : 'Готово'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EducationCard({
  control,
  errors,
  isPending,
  locked = () => false,
  className,
  action,
  certificates,
}: CardProps & {
  /**
   * Present only where the language certificates can be edited: an existing
   * person's edit form and their own profile (owner, 2026-10-14). The create
   * dialog leaves it out — a scan is stored under the person's own id, which does
   * not exist yet — and so draws no certificate fields at all.
   */
  certificates?: CertificateScans;
}) {
  // The education entries as a list of cards (owner, 2026-10-10): «+ Додати освіту»
  // and the pencil open a popup with the fields, so the form stays short however
  // many a person holds. Since 2026-10-14 the list holds the basic education too
  // (бакалавр / магістр / спеціаліст — a person may have several). The list is what
  // is saved; the old slot columns and the two `basicEducation*` columns are
  // written from it.
  const { fields, append, update, remove } = useFieldArray({ control, name: 'degrees' });
  const [dialog, setDialog] = useState<{ index: number | null; row: DegreeFormRow } | null>(null);
  const degreesLocked = isPending || locked('degrees');

  const diplomaCards = fields.map((row, index) => (
    <DegreeCard
      key={row.id}
      row={row as unknown as DegreeFormRow}
      disabled={degreesLocked}
      onEdit={() => setDialog({ index, row: row as unknown as DegreeFormRow })}
      onRemove={() => remove(index)}
    />
  ));
  const addDiploma = (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={degreesLocked}
      onClick={() => setDialog({ index: null, row: { ...EMPTY_DEGREE_ROW } })}
    >
      <Plus className="size-4" />
      Додати освіту
    </Button>
  );
  const layout = (certificateCards: ReactNode, certificateButtons: ReactNode) => (
    <div className="space-y-3">
      {diplomaCards}
      {certificateCards}
      {addDiploma}
      {certificateButtons}
      {typeof errors.degrees?.message === 'string' && (
        <p className="text-sm text-error">{errors.degrees.message}</p>
      )}
    </div>
  );

  return (
    <Card title={CARD_TITLES.education} action={action} className={className}>
      {/* Every «Додати …» button goes at the BOTTOM of «Освіта», under all the
          cards (owner, 2026-10-14): the diplomas, then the language certificates, then
          the three buttons. The certificates' form object is read as their own shape —
          their names are not in the academic values' type, hence the cast the
          sibling cards use too. */}
      {certificates ? (
        <CertificateFields
          control={control as unknown as Control<CertificatesFormValues>}
          isPending={isPending}
          locked={locked as (field: string) => boolean}
          scans={certificates}
        >
          {({ cards, buttons }) => layout(cards, buttons)}
        </CertificateFields>
      ) : (
        layout(null, null)
      )}

      <DegreeDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onDone={(index, row) => {
          // `row` is the draft, with the form's own `id` (RHF's) left out.
          const value: DegreeFormRow = {
            degree: row.degree,
            specialty: row.specialty,
            defenceDate: row.defenceDate,
            matchesDepartment: row.matchesDepartment,
            issuedBy: row.issuedBy,
            series: row.series,
            number: row.number,
            issueDate: row.issueDate,
            basicLevel: row.basicLevel,
            topic: row.topic,
          };
          if (index === null) append(value);
          else update(index, value);
          setDialog(null);
        }}
      />
    </Card>
  );
}

'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';

// what is in the app today
import { Button as LegacyButton } from '@/components/ui/button';
import { Input as LegacyInput } from '@/components/ui/input';
import { PassInput as LegacyPassInput } from '@/components/ui/pass-input';
import { Textarea as LegacyTextarea } from '@/components/ui/textarea';
import { Switch as LegacySwitch } from '@/components/ui/switch';
import { Label as LegacyLabel } from '@/components/ui/label';
import {
  Select as LegacySelect,
  SelectContent as LegacySelectContent,
  SelectItem as LegacySelectItem,
  SelectTrigger as LegacySelectTrigger,
  SelectValue as LegacySelectValue,
} from '@/components/ui/select';
import { Calendar as LegacyCalendar } from '@/components/ui/calendar';
import {
  Popover as LegacyPopover,
  PopoverContent as LegacyPopoverContent,
  PopoverTrigger as LegacyPopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import {
  Combobox as LegacyCombobox,
  ComboboxContent as LegacyComboboxContent,
  ComboboxEmpty as LegacyComboboxEmpty,
  ComboboxInput as LegacyComboboxInput,
  ComboboxItem as LegacyComboboxItem,
  ComboboxList as LegacyComboboxList,
} from '@/components/ui/combobox';
import { TelInput as LegacyTelInput } from '@/components/ui/tel-input';
import { OrcidInput as LegacyOrcidInput } from '@/components/ui/orcid-input';
import { IsbnInput as LegacyIsbnInput } from '@/components/ui/isbn-input';
import { DoiInput as LegacyDoiInput } from '@/components/ui/doi-input';
import { FileInput as LegacyFileInput } from '@/components/ui/file-input';
import { Pagination as LegacyPagination } from '@/components/ui/pagination';
import {
  AlertDialog as LegacyAlertDialog,
  AlertDialogAction as LegacyAlertDialogAction,
  AlertDialogCancel as LegacyAlertDialogCancel,
  AlertDialogContent as LegacyAlertDialogContent,
  AlertDialogDescription as LegacyAlertDialogDescription,
  AlertDialogFooter as LegacyAlertDialogFooter,
  AlertDialogHeader as LegacyAlertDialogHeader,
  AlertDialogTitle as LegacyAlertDialogTitle,
  AlertDialogTrigger as LegacyAlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Sheet as LegacySheet,
  SheetContent as LegacySheetContent,
  SheetDescription as LegacySheetDescription,
  SheetHeader as LegacySheetHeader,
  SheetTitle as LegacySheetTitle,
  SheetTrigger as LegacySheetTrigger,
} from '@/components/ui/sheet';
import {
  Tooltip as LegacyTooltip,
  TooltipContent as LegacyTooltipContent,
  TooltipProvider as LegacyTooltipProvider,
  TooltipTrigger as LegacyTooltipTrigger,
} from '@/components/ui/tooltip';

// what replaces it
import { Button } from '@/components/aurora/ui/button';
import { Input } from '@/components/aurora/ui/input';
import { PassInput } from '@/components/aurora/ui/pass-input';
import { EmailInput } from '@/components/aurora/ui/email-input';
import { Textarea } from '@/components/aurora/ui/textarea';
import { Switch } from '@/components/aurora/ui/switch';
import { Label } from '@/components/aurora/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { Calendar } from '@/components/aurora/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/aurora/ui/popover';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/aurora/ui/combobox';
import { TelInput } from '@/components/aurora/ui/tel-input';
import { OrcidInput } from '@/components/aurora/ui/orcid-input';
import { IsbnInput } from '@/components/aurora/ui/isbn-input';
import { DoiInput } from '@/components/aurora/ui/doi-input';
import { FileInput } from '@/components/aurora/ui/file-input';
import { Checkbox } from '@/components/aurora/ui/checkbox';
import { Pagination } from '@/components/aurora/ui/pagination';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/aurora/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/aurora/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/aurora/ui/tooltip';

const RANKS = [
  { value: 'LECTURER', label: 'Викладач' },
  { value: 'SENIOR_LECTURER', label: 'Старший викладач' },
  { value: 'DOCENT', label: 'Доцент' },
  { value: 'PROFESSOR', label: 'Професор' },
];

const DEPARTMENTS = [
  'Кафедра вищої математики',
  'Кафедра інформатики',
  'Кафедра фізики',
  'Кафедра педагогіки',
];

const d = (v?: Date) => (v ? v.toLocaleDateString('uk-UA') : null);
const range = (r?: DateRange) => (r?.from ? `${d(r.from)}${r.to ? ` — ${d(r.to)}` : ''}` : null);

const BUTTON_VARIANTS = [
  'default',
  'outline',
  'secondary',
  'ghost',
  'destructive',
  'link',
] as const;

/** One control, old on the left and new on the right, sharing a row. */
function Row({
  name,
  note,
  before,
  after,
}: {
  name: string;
  note?: string;
  before: React.ReactNode;
  after: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 border-t py-5 lg:grid-cols-[10rem_1fr_1fr] lg:gap-6">
      <div className="lg:pt-1">
        <p className="text-sm font-medium">{name}</p>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>
      <div className="space-y-2">{before}</div>
      <div className="space-y-2">{after}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground uppercase">
        {title}
      </h2>
      <div className="grid gap-4 pb-1 text-xs text-muted-foreground lg:grid-cols-[10rem_1fr_1fr] lg:gap-6">
        <span />
        <span>Зараз</span>
        <span className="text-brand">«Аврора»</span>
      </div>
      {children}
    </section>
  );
}

export function ControlsGallery() {
  const [onOld, setOnOld] = useState(true);
  const [onNew, setOnNew] = useState(true);
  const [depOld, setDepOld] = useState('');
  const [depNew, setDepNew] = useState('');
  const [dayOld, setDayOld] = useState<Date | undefined>(new Date(2026, 3, 19));
  const [dayNew, setDayNew] = useState<Date | undefined>(new Date(2026, 3, 19));
  // Separate state per calendar. They shared one `rangeNew`, so a click in
  // either was interpreted against a range the OTHER had just rewritten —
  // which is why the start date would only ever move backwards.
  const [rangeOld, setRangeOld] = useState<DateRange | undefined>();
  const [rangeNew, setRangeNew] = useState<DateRange | undefined>();
  // The masked fields are CONTROLLED — they reformat on every keystroke, which
  // an uncontrolled input cannot do without the caret jumping. Each side needs
  // its own state for the same reason the two calendars do.
  const [telOld, setTelOld] = useState('');
  const [telNew, setTelNew] = useState('');
  const [orcidOld, setOrcidOld] = useState('');
  const [orcidNew, setOrcidNew] = useState('');
  const [fileOld, setFileOld] = useState<File | null>(null);
  const [fileNew, setFileNew] = useState<File | null>(null);
  const [boxOld, setBoxOld] = useState(true);
  const [boxNew, setBoxNew] = useState<boolean | 'indeterminate'>(true);
  const [pageOld, setPageOld] = useState(7);
  const [pageNew, setPageNew] = useState(7);

  return (
    <div className="space-y-6">
      <Section title="Текстові поля">
        <Row
          name="LegacyInput"
          note="порожнє"
          before={<LegacyInput placeholder="Введіть значення" />}
          after={<Input placeholder="Введіть значення" />}
        />
        <Row
          name="LegacyInput"
          note="із значенням"
          before={<LegacyInput defaultValue="Ковальчук" />}
          after={<Input defaultValue="Ковальчук" />}
        />
        <Row
          name="LegacyInput"
          note="великий — тільки «Аврора»"
          before={<LegacyInput disabled placeholder="такого розміру немає" />}
          after={<Input size="lg" placeholder="Високе поле для форми входу" />}
        />
        <Row
          name="LegacyInput"
          note="помилка"
          before={<LegacyInput aria-invalid defaultValue="хибне значення" />}
          after={<Input aria-invalid defaultValue="хибне значення" />}
        />
        <Row
          name="LegacyInput"
          note="вимкнене"
          before={<LegacyInput disabled defaultValue="Недоступно" />}
          after={<Input disabled defaultValue="Недоступно" />}
        />
        <Row
          name="LegacyTextarea"
          before={<LegacyTextarea placeholder="Коментар" />}
          after={<Textarea placeholder="Коментар" />}
        />
      </Section>

      <Section title="Спеціальні поля">
        <Row
          name="LegacyPassInput"
          note="око перемикає тип"
          before={<LegacyPassInput defaultValue="secret123" />}
          after={<PassInput defaultValue="secret123" />}
        />
        <Row
          name="EmailInput"
          note="новий: маска й мобільні атрибути"
          before={<LegacyInput type="email" disabled placeholder="окремого компонента не було" />}
          after={<EmailInput />}
        />
        <Row
          name="LegacyTelInput"
          note="+380 належить полю; лічильник під час набору"
          before={<LegacyTelInput value={telOld} onChange={setTelOld} />}
          after={<TelInput value={telNew} onChange={setTelNew} />}
        />
        <Row
          name="LegacyOrcidInput"
          note="спробуйте 0000-0002-1825-0097, тоді змініть останню цифру"
          before={<LegacyOrcidInput value={orcidOld} onChange={setOrcidOld} />}
          after={<OrcidInput value={orcidNew} onChange={setOrcidNew} />}
        />
        <Row
          name="LegacyIsbnInput"
          note="978-3-16-148410-0 — контрольна цифра справжня"
          before={<LegacyIsbnInput />}
          after={<IsbnInput />}
        />
        <Row
          name="LegacyDoiInput"
          note="правильний DOI додає посилання «Відкрити»"
          before={<LegacyDoiInput />}
          after={<DoiInput />}
        />
        <Row
          name="LegacyFileInput"
          note="обраний файл — чіп із ×, а не підпис поруч"
          before={<LegacyFileInput value={fileOld} onChange={setFileOld} />}
          after={<FileInput value={fileNew} onChange={setFileNew} />}
        />
        <Row
          name="вимкнені"
          note="усі спеціальні поля — вимкнений стан"
          before={
            <div className="space-y-2">
              <LegacyTelInput value="+380441234567" onChange={() => {}} disabled />
              <LegacyFileInput value={null} onChange={() => {}} disabled />
            </div>
          }
          after={
            <div className="space-y-2">
              <TelInput value="+380441234567" onChange={() => {}} disabled />
              <FileInput value={null} onChange={() => {}} disabled />
            </div>
          }
        />
      </Section>

      <Section title="Вибір">
        <Row
          name="LegacySelect"
          before={
            <LegacySelect>
              <LegacySelectTrigger className="w-full">
                <LegacySelectValue placeholder="Вчене звання" />
              </LegacySelectTrigger>
              <LegacySelectContent>
                {RANKS.map((r) => (
                  <LegacySelectItem key={r.value} value={r.value}>
                    {r.label}
                  </LegacySelectItem>
                ))}
              </LegacySelectContent>
            </LegacySelect>
          }
          after={
            <Select>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Вчене звання" />
              </SelectTrigger>
              <SelectContent>
                {RANKS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <Row
          name="LegacySwitch"
          note="увімкнено = акцент, а не чорний"
          before={
            <div className="flex items-center gap-2">
              <LegacySwitch checked={onOld} onCheckedChange={setOnOld} id="sw-old" />
              <LegacyLabel htmlFor="sw-old">Ступінь відповідає кафедрі</LegacyLabel>
            </div>
          }
          after={
            <div className="flex items-center gap-2">
              <Switch checked={onNew} onCheckedChange={setOnNew} id="sw-new" />
              <Label htmlFor="sw-new">Ступінь відповідає кафедрі</Label>
            </div>
          }
        />
        <Row
          name="Checkbox"
          note="компонента не було: три екрани мали власний нативний input"
          before={
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={boxOld}
                  onChange={(e) => setBoxOld(e.target.checked)}
                  className="size-4 cursor-pointer rounded border-border accent-primary"
                />
                accent-primary — /admin/permissions
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" defaultChecked className="size-4 accent-foreground" />
                accent-foreground — Характеристика
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" disabled className="size-4 accent-primary" />
                вимкнений
              </label>
            </div>
          }
          after={
            <div className="space-y-2">
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={boxNew} onCheckedChange={setBoxNew} />
                обрано
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox disabled />
                вимкнений
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox aria-invalid />
                помилка
              </Label>
            </div>
          }
        />
      </Section>

      <Section title="LegacyCombobox">
        <Row
          name="LegacyCombobox"
          note="пошук у списку кафедр"
          before={
            <LegacyCombobox
              items={DEPARTMENTS}
              value={depOld}
              onChange={setDepOld}
              displayValue={depOld}
            >
              <LegacyComboboxInput placeholder="Оберіть кафедру" />
              <LegacyComboboxContent>
                {/* `LegacyComboboxList` takes a RENDER FUNCTION, not children — it
                    maps over the filtered items itself, so the search works. */}
                <LegacyComboboxList<string>>
                  {(d) => (
                    <LegacyComboboxItem key={d} value={d}>
                      {d}
                    </LegacyComboboxItem>
                  )}
                </LegacyComboboxList>
                <LegacyComboboxEmpty>Нічого не знайдено</LegacyComboboxEmpty>
              </LegacyComboboxContent>
            </LegacyCombobox>
          }
          after={
            <Combobox items={DEPARTMENTS} value={depNew} onChange={setDepNew} displayValue={depNew}>
              <ComboboxInput placeholder="Оберіть кафедру" />
              <ComboboxContent>
                <ComboboxList<string>>
                  {(d) => (
                    <ComboboxItem key={d} value={d}>
                      {d}
                    </ComboboxItem>
                  )}
                </ComboboxList>
                <ComboboxEmpty>Нічого не знайдено</ComboboxEmpty>
              </ComboboxContent>
            </Combobox>
          }
        />
      </Section>

      <Section title="Календар">
        <Row
          name="Дата"
          note="відкривається з поля, а не показана одразу"
          before={
            <LegacyPopover>
              <LegacyPopoverTrigger asChild>
                <LegacyButton variant="outline" className="justify-start gap-2 font-normal">
                  <CalendarIcon className="size-4 text-muted-foreground" />
                  {d(dayOld) ?? <span className="text-muted-foreground">Оберіть дату</span>}
                </LegacyButton>
              </LegacyPopoverTrigger>
              <LegacyPopoverContent className="w-auto p-0" align="start">
                <LegacyCalendar mode="single" selected={dayOld} onSelect={setDayOld} />
              </LegacyPopoverContent>
            </LegacyPopover>
          }
          after={
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start gap-2 font-normal">
                  <CalendarIcon className="text-muted-foreground" />
                  {d(dayNew) ?? <span className="text-muted-foreground">Оберіть дату</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dayNew} onSelect={setDayNew} />
              </PopoverContent>
            </Popover>
          }
        />
        <Row
          name="Діапазон"
          note="смуга має проходити під обома кінцями"
          before={
            <LegacyPopover>
              <LegacyPopoverTrigger asChild>
                <LegacyButton variant="outline" className="justify-start gap-2 font-normal">
                  <CalendarIcon className="size-4 text-muted-foreground" />
                  {range(rangeOld) ?? <span className="text-muted-foreground">Оберіть період</span>}
                </LegacyButton>
              </LegacyPopoverTrigger>
              <LegacyPopoverContent className="w-auto p-0" align="start">
                <LegacyCalendar mode="range" selected={rangeOld} onSelect={setRangeOld} />
              </LegacyPopoverContent>
            </LegacyPopover>
          }
          after={
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start gap-2 font-normal">
                  <CalendarIcon className="text-muted-foreground" />
                  {range(rangeNew) ?? <span className="text-muted-foreground">Оберіть період</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="range" selected={rangeNew} onSelect={setRangeNew} />
              </PopoverContent>
            </Popover>
          }
        />
      </Section>

      <Section title="Кнопки">
        {BUTTON_VARIANTS.map((v) => (
          <Row
            key={v}
            name={v}
            before={<LegacyButton variant={v}>Зберегти</LegacyButton>}
            after={<Button variant={v}>Зберегти</Button>}
          />
        ))}
        <Row
          name="розміри"
          note="xl є тільки в «Аврорі»"
          before={
            <div className="flex flex-wrap items-center gap-2">
              {(['xs', 'sm', 'default', 'lg'] as const).map((s) => (
                <LegacyButton key={s} size={s}>
                  {s}
                </LegacyButton>
              ))}
            </div>
          }
          after={
            <div className="flex flex-wrap items-center gap-2">
              {(['xs', 'sm', 'default', 'lg', 'xl'] as const).map((s) => (
                <Button key={s} size={s}>
                  {s}
                </Button>
              ))}
            </div>
          }
        />
        <Row
          name="стан"
          note="loading вимикає кнопку"
          before={
            <div className="flex flex-wrap gap-2">
              <LegacyButton disabled>Вимкнено</LegacyButton>
              <LegacyButton loading>Збереження</LegacyButton>
            </div>
          }
          after={
            <div className="flex flex-wrap gap-2">
              <Button disabled>Вимкнено</Button>
              <Button loading>Збереження</Button>
            </div>
          }
        />
      </Section>

      <Section title="Накладки">
        <Row
          name="LegacyAlertDialog"
          note="найчастіший компонент після кнопки — 21 імпорт"
          before={
            <LegacyAlertDialog>
              <LegacyAlertDialogTrigger asChild>
                <LegacyButton variant="destructive">Архівувати</LegacyButton>
              </LegacyAlertDialogTrigger>
              <LegacyAlertDialogContent>
                <LegacyAlertDialogHeader>
                  <LegacyAlertDialogTitle>Архівувати Ковальчук О. П.?</LegacyAlertDialogTitle>
                  <LegacyAlertDialogDescription>
                    Людина зникне зі списків і рейтингу поточного року. Закриті роки та всі
                    досягнення залишаться. Це можна скасувати.
                  </LegacyAlertDialogDescription>
                </LegacyAlertDialogHeader>
                <LegacyAlertDialogFooter>
                  <LegacyAlertDialogCancel>Скасувати</LegacyAlertDialogCancel>
                  <LegacyAlertDialogAction>Архівувати</LegacyAlertDialogAction>
                </LegacyAlertDialogFooter>
              </LegacyAlertDialogContent>
            </LegacyAlertDialog>
          }
          after={
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Архівувати</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Архівувати Ковальчук О. П.?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Людина зникне зі списків і рейтингу поточного року. Закриті роки та всі
                    досягнення залишаться. Це можна скасувати.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Скасувати</AlertDialogCancel>
                  <AlertDialogAction>Архівувати</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          }
        />
        <Row
          name="LegacyAlertDialog"
          note="незворотне, але не руйнівне — варіант, якого раніше не було"
          before={
            <LegacyButton variant="outline" disabled>
              вибору варіанта не було
            </LegacyButton>
          }
          after={
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">Закрити рік</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Закрити рейтинг 2026 року?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Показники року стануть незмінними. Відкрити його знову може лише адміністратор —
                    через апеляцію.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Скасувати</AlertDialogCancel>
                  <AlertDialogAction variant="default">Закрити рік</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          }
        />
        <Row
          name="LegacySheet"
          note="панель з краю — форма подання досягнення"
          before={
            <LegacySheet>
              <LegacySheetTrigger asChild>
                <LegacyButton variant="outline">Відкрити панель</LegacyButton>
              </LegacySheetTrigger>
              <LegacySheetContent>
                <LegacySheetHeader>
                  <LegacySheetTitle>3.25 Патент на винахід</LegacySheetTitle>
                  <LegacySheetDescription>
                    Заповніть підтвердження та збережіть.
                  </LegacySheetDescription>
                </LegacySheetHeader>
                <div className="px-6 text-sm text-muted-foreground">
                  Список за панеллю має лишатися читабельним — саме тому це панель, а не діалог.
                </div>
              </LegacySheetContent>
            </LegacySheet>
          }
          after={
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">Відкрити панель</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>3.25 Патент на винахід</SheetTitle>
                  <SheetDescription>Заповніть підтвердження та збережіть.</SheetDescription>
                </SheetHeader>
                <div className="px-6 text-sm text-muted-foreground">
                  Список за панеллю має лишатися читабельним — саме тому це панель, а не діалог.
                </div>
              </SheetContent>
            </Sheet>
          }
        />
        <Row
          name="LegacyTooltip"
          note="лишається темним — це підпис, а не поверхня"
          before={
            <LegacyTooltipProvider>
              <LegacyTooltip>
                <LegacyTooltipTrigger asChild>
                  <LegacyButton variant="ghost">Кнпп</LegacyButton>
                </LegacyTooltipTrigger>
                <LegacyTooltipContent>Скільки НПП кафедри відповідають п. 38</LegacyTooltipContent>
              </LegacyTooltip>
            </LegacyTooltipProvider>
          }
          after={
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost">Кнпп</Button>
                </TooltipTrigger>
                <TooltipContent>Скільки НПП кафедри відповідають п. 38</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          }
        />
      </Section>

      <Section title="Пагінація">
        <Row
          name="LegacyPagination"
          note="поточна сторінка — акцент, а не сірий secondary"
          before={
            <LegacyPagination
              page={pageOld}
              totalPages={20}
              onPageChange={setPageOld}
              summary="204 записів"
            />
          }
          after={
            <Pagination
              page={pageNew}
              totalPages={20}
              onPageChange={setPageNew}
              summary="204 записів"
            />
          }
        />
      </Section>
    </div>
  );
}

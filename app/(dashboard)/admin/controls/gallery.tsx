'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';

// what is in the app today
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PassInput } from '@/components/ui/pass-input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';

// what replaces it
import { AuroraButton } from '@/components/aurora/ui/button';
import { AuroraInput } from '@/components/aurora/ui/input';
import { AuroraPassInput } from '@/components/aurora/ui/pass-input';
import { EmailInput } from '@/components/aurora/ui/email-input';
import { AuroraTextarea } from '@/components/aurora/ui/textarea';
import { AuroraSwitch } from '@/components/aurora/ui/switch';
import { AuroraLabel } from '@/components/aurora/ui/label';
import {
  AuroraSelect,
  AuroraSelectContent,
  AuroraSelectItem,
  AuroraSelectTrigger,
  AuroraSelectValue,
} from '@/components/aurora/ui/select';
import { AuroraCalendar } from '@/components/aurora/ui/calendar';
import {
  AuroraPopover,
  AuroraPopoverContent,
  AuroraPopoverTrigger,
} from '@/components/aurora/ui/popover';
import {
  AuroraCombobox,
  AuroraComboboxContent,
  AuroraComboboxEmpty,
  AuroraComboboxInput,
  AuroraComboboxItem,
  AuroraComboboxList,
} from '@/components/aurora/ui/combobox';

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

  return (
    <div className="space-y-6">
      <Section title="Текстові поля">
        <Row
          name="Input"
          note="порожнє"
          before={<Input placeholder="Введіть значення" />}
          after={<AuroraInput placeholder="Введіть значення" />}
        />
        <Row
          name="Input"
          note="із значенням"
          before={<Input defaultValue="Ковальчук" />}
          after={<AuroraInput defaultValue="Ковальчук" />}
        />
        <Row
          name="Input"
          note="великий — тільки «Аврора»"
          before={<Input disabled placeholder="такого розміру немає" />}
          after={<AuroraInput size="lg" placeholder="Високе поле для форми входу" />}
        />
        <Row
          name="Input"
          note="помилка"
          before={<Input aria-invalid defaultValue="хибне значення" />}
          after={<AuroraInput aria-invalid defaultValue="хибне значення" />}
        />
        <Row
          name="Input"
          note="вимкнене"
          before={<Input disabled defaultValue="Недоступно" />}
          after={<AuroraInput disabled defaultValue="Недоступно" />}
        />
        <Row
          name="Textarea"
          before={<Textarea placeholder="Коментар" />}
          after={<AuroraTextarea placeholder="Коментар" />}
        />
      </Section>

      <Section title="Спеціальні поля">
        <Row
          name="PassInput"
          note="око перемикає тип"
          before={<PassInput defaultValue="secret123" />}
          after={<AuroraPassInput defaultValue="secret123" />}
        />
        <Row
          name="EmailInput"
          note="новий: маска й мобільні атрибути"
          before={<Input type="email" disabled placeholder="окремого компонента не було" />}
          after={<EmailInput />}
        />
      </Section>

      <Section title="Вибір">
        <Row
          name="Select"
          before={
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
          after={
            <AuroraSelect>
              <AuroraSelectTrigger className="w-full">
                <AuroraSelectValue placeholder="Вчене звання" />
              </AuroraSelectTrigger>
              <AuroraSelectContent>
                {RANKS.map((r) => (
                  <AuroraSelectItem key={r.value} value={r.value}>
                    {r.label}
                  </AuroraSelectItem>
                ))}
              </AuroraSelectContent>
            </AuroraSelect>
          }
        />
        <Row
          name="Switch"
          note="увімкнено = акцент, а не чорний"
          before={
            <div className="flex items-center gap-2">
              <Switch checked={onOld} onCheckedChange={setOnOld} id="sw-old" />
              <Label htmlFor="sw-old">Ступінь відповідає кафедрі</Label>
            </div>
          }
          after={
            <div className="flex items-center gap-2">
              <AuroraSwitch checked={onNew} onCheckedChange={setOnNew} id="sw-new" />
              <AuroraLabel htmlFor="sw-new">Ступінь відповідає кафедрі</AuroraLabel>
            </div>
          }
        />
      </Section>

      <Section title="Combobox">
        <Row
          name="Combobox"
          note="пошук у списку кафедр"
          before={
            <Combobox items={DEPARTMENTS} value={depOld} onChange={setDepOld} displayValue={depOld}>
              <ComboboxInput placeholder="Оберіть кафедру" />
              <ComboboxContent>
                {/* `ComboboxList` takes a RENDER FUNCTION, not children — it
                    maps over the filtered items itself, so the search works. */}
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
          after={
            <AuroraCombobox
              items={DEPARTMENTS}
              value={depNew}
              onChange={setDepNew}
              displayValue={depNew}
            >
              <AuroraComboboxInput placeholder="Оберіть кафедру" />
              <AuroraComboboxContent>
                <AuroraComboboxList<string>>
                  {(d) => (
                    <AuroraComboboxItem key={d} value={d}>
                      {d}
                    </AuroraComboboxItem>
                  )}
                </AuroraComboboxList>
                <AuroraComboboxEmpty>Нічого не знайдено</AuroraComboboxEmpty>
              </AuroraComboboxContent>
            </AuroraCombobox>
          }
        />
      </Section>

      <Section title="Календар">
        <Row
          name="Дата"
          note="відкривається з поля, а не показана одразу"
          before={
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start gap-2 font-normal">
                  <CalendarIcon className="size-4 text-muted-foreground" />
                  {d(dayOld) ?? <span className="text-muted-foreground">Оберіть дату</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dayOld} onSelect={setDayOld} />
              </PopoverContent>
            </Popover>
          }
          after={
            <AuroraPopover>
              <AuroraPopoverTrigger asChild>
                <AuroraButton variant="outline" className="justify-start gap-2 font-normal">
                  <CalendarIcon className="text-muted-foreground" />
                  {d(dayNew) ?? <span className="text-muted-foreground">Оберіть дату</span>}
                </AuroraButton>
              </AuroraPopoverTrigger>
              <AuroraPopoverContent className="w-auto p-0" align="start">
                <AuroraCalendar mode="single" selected={dayNew} onSelect={setDayNew} />
              </AuroraPopoverContent>
            </AuroraPopover>
          }
        />
        <Row
          name="Діапазон"
          note="смуга має проходити під обома кінцями"
          before={
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start gap-2 font-normal">
                  <CalendarIcon className="size-4 text-muted-foreground" />
                  {range(rangeOld) ?? <span className="text-muted-foreground">Оберіть період</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="range" selected={rangeOld} onSelect={setRangeOld} />
              </PopoverContent>
            </Popover>
          }
          after={
            <AuroraPopover>
              <AuroraPopoverTrigger asChild>
                <AuroraButton variant="outline" className="justify-start gap-2 font-normal">
                  <CalendarIcon className="text-muted-foreground" />
                  {range(rangeNew) ?? <span className="text-muted-foreground">Оберіть період</span>}
                </AuroraButton>
              </AuroraPopoverTrigger>
              <AuroraPopoverContent className="w-auto p-0" align="start">
                <AuroraCalendar mode="range" selected={rangeNew} onSelect={setRangeNew} />
              </AuroraPopoverContent>
            </AuroraPopover>
          }
        />
      </Section>

      <Section title="Кнопки">
        {BUTTON_VARIANTS.map((v) => (
          <Row
            key={v}
            name={v}
            before={<Button variant={v}>Зберегти</Button>}
            after={<AuroraButton variant={v}>Зберегти</AuroraButton>}
          />
        ))}
        <Row
          name="розміри"
          note="xl є тільки в «Аврорі»"
          before={
            <div className="flex flex-wrap items-center gap-2">
              {(['xs', 'sm', 'default', 'lg'] as const).map((s) => (
                <Button key={s} size={s}>
                  {s}
                </Button>
              ))}
            </div>
          }
          after={
            <div className="flex flex-wrap items-center gap-2">
              {(['xs', 'sm', 'default', 'lg', 'xl'] as const).map((s) => (
                <AuroraButton key={s} size={s}>
                  {s}
                </AuroraButton>
              ))}
            </div>
          }
        />
        <Row
          name="стан"
          note="loading вимикає кнопку"
          before={
            <div className="flex flex-wrap gap-2">
              <Button disabled>Вимкнено</Button>
              <Button loading>Збереження</Button>
            </div>
          }
          after={
            <div className="flex flex-wrap gap-2">
              <AuroraButton disabled>Вимкнено</AuroraButton>
              <AuroraButton loading>Збереження</AuroraButton>
            </div>
          }
        />
      </Section>
    </div>
  );
}

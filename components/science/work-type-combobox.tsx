'use client';

import { useMemo } from 'react';
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
import { Label } from '@/components/aurora/ui/label';
import type { PlanWorkType } from '@/components/science/add-plan-row-dialog';

/**
 * «Вид роботи» — the Додаток III picker both the plan and the record dialog use.
 *
 * **Two fields, not one list** (owner, 2026-09-20). Додаток III prints ONE
 * numbered row that sometimes covers several kinds of work, and flattening
 * that into 26 sentences made п.7 unreadable: four options, two of them
 * opening with the same 47 characters and wrapping to three lines each.
 *
 * So the пункт is its own field, and the вид роботи is a second one — the
 * cascade this app already uses for факультет → кафедра. The second field
 * costs nothing where it has nothing to ask: twelve пункти hold a single вид
 * роботи, and there it is filled in and shown as plain text.
 *
 * Every entry reads «N · заголовок». Where the catalogue has no heading typed
 * the first вид роботи under that пункт stands in, because a bare «Пункт 3»
 * tells nobody anything. Searching reads the heading, the number and every
 * label underneath, so «монограф» finds п.3 whatever it is called.
 */
export function WorkTypeCombobox({
  workTypes,
  value,
  onChange,
  item: pickedItem,
  onItemChange,
}: {
  workTypes: PlanWorkType[];
  value: string;
  onChange: (next: string) => void;
  /**
   * The chosen пункт, OWNED BY THE DIALOG.
   *
   * It cannot be derived from the chosen вид роботи, which was the first
   * attempt and left the field unusable: picking a пункт that holds several
   * види has no вид yet, so there was nothing to derive from and the control
   * cleared itself the instant you chose (owner, 2026-09-20).
   *
   * **It was a `useState` in here, and that was the bug** (2026-09-22). Both
   * dialogs render this picker as a child of an `EvidenceForm` carrying
   * `key={selected?.id ?? 'none'}` — so choosing a вид роботи remounts the
   * form AND everything inside it, this control included, wiping the пункт it
   * had just been told about.
   *
   * It only showed on one path, which is why it survived: the key changes only
   * when `selected?.id` does. Coming FROM a пункт with a single вид (п.2, п.4,
   * п.5 — those set a real id) TO one with several (which sets `''`) flips the
   * key back to `'none'`, remounts, and `setPickedItem` is discarded — so the
   * field went blank and the list closed on nothing. Between two multi-вид
   * пункти the key never moves off `'none'` and it worked fine.
   *
   * State that has to outlive a sibling's remount cannot live under it.
   */
  item: string;
  onItemChange: (next: string) => void;
}) {
  /** One entry per пункт, in the catalogue's own order. */
  const items = useMemo(() => groupByItem(workTypes), [workTypes]);

  const selectedType = workTypes.find((t) => t.id === value);

  // A вид роботи set from outside — editing an existing row — decides the
  // пункт by itself, so it is read first and no effect has to copy it across.
  const itemNumber = selectedType?.itemNumber ?? pickedItem;
  const selectedItem = items.find((i) => i.itemNumber === itemNumber);

  function pickItem(next: string) {
    // Picking the пункт already chosen changes nothing. Handled as a change it
    // cleared the вид роботи, which remounted the form and threw away every
    // value typed into it (owner, 2026-09-24).
    if (next === itemNumber) return;
    const item = items.find((i) => i.itemNumber === next);
    if (!item) return;
    onItemChange(next);
    // A пункт with one вид роботи has already been answered by choosing it;
    // one with several clears the вид so the second field asks for it.
    onChange(item.types.length === 1 ? item.types[0].id : '');
  }

  return (
    <div className="space-y-4">
      <Combobox
        items={items}
        value={itemNumber}
        onChange={pickItem}
        filter={(item: ItemGroup, search) => {
          const needle = search.toLowerCase().trim();
          return (
            // «12» finds «Керівництво аспірантами» — the наказ's own numbering
            // is how people who work with the document refer to these.
            item.itemNumber.startsWith(needle) ||
            item.title.toLowerCase().includes(needle) ||
            // An untitled пункт is nothing but a number on screen, so the only
            // way to find it by words is through the work it covers.
            item.types.some((t) => t.label.toLowerCase().includes(needle))
          );
        }}
        displayValue={selectedItem ? itemDisplay(selectedItem) : ''}
      >
        {/* «Вид роботи» is what a person is choosing — the Додаток III
            numbering stays visible in every entry (owner, 2026-09-24). */}
        <p className="mb-1 block text-sm font-medium">Вид роботи</p>
        <ComboboxInput
          placeholder="Почніть вводити назву або номер пункту"
          aria-label="Вид роботи"
        />
        <ComboboxContent>
          <ComboboxEmpty>Нічого не знайдено</ComboboxEmpty>
          <ComboboxList<ItemGroup>>
            {(item) => (
              <ComboboxItem key={item.itemNumber} value={item.itemNumber}>
                {itemDisplay(item)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {selectedItem && selectedItem.types.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor="work-type-variant">Різновид</Label>
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger id="work-type-variant" className="w-full">
              <SelectValue placeholder="Оберіть…" />
            </SelectTrigger>
            <SelectContent>
              {selectedItem.types.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {variantLabel(type, selectedItem.title)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* One вид роботи under this пункт — already chosen, and said out loud so
          the form is never silently deciding something on somebody's behalf. */}
      {selectedItem &&
        selectedItem.types.length === 1 &&
        // Not when it would only repeat the entry above it — «4 · Наукова
        // стаття» over «Наукова стаття» said the same thing twice.
        selectedItem.types[0].label !== selectedItem.title && (
          <p className="text-sm text-foreground-soft">{selectedItem.types[0].label}</p>
        )}
    </div>
  );
}

interface ItemGroup {
  itemNumber: string;
  /** The heading, or `''` where the catalogue has none. */
  title: string;
  types: PlanWorkType[];
}

function groupByItem(workTypes: PlanWorkType[]): ItemGroup[] {
  const byNumber = new Map<string, ItemGroup>();
  for (const type of workTypes) {
    const existing = byNumber.get(type.itemNumber);
    if (existing) {
      existing.types.push(type);
      // The heading lives on every type of the пункт; the first that has one
      // answers for all, so a half-filled catalogue still reads correctly.
      if (!existing.title && type.itemTitle) existing.title = type.itemTitle;
    } else {
      byNumber.set(type.itemNumber, {
        itemNumber: type.itemNumber,
        title: type.itemTitle ?? '',
        types: [type],
      });
    }
  }
  return [...byNumber.values()];
}

function itemDisplay(item: ItemGroup): string {
  // Never a bare «Пункт 3». A number on its own tells nobody what the пункт
  // covers, and the catalogue always has SOMETHING to say — the heading where
  // one is typed, otherwise the first вид роботи under it.
  return `${item.itemNumber} · ${item.title || item.types[0].label}`;
}

/**
 * What the second field shows for one вид роботи.
 *
 * `shortLabel` first: the catalogue's own short form, typed by an ADMIN,
 * because most пункти do not have a heading their labels literally begin
 * with — «Перемога у конкурсі…» shares no prefix with «Участь у конкурсі…».
 *
 * Failing that, drop the heading where the label does open with it, which is
 * what п.7 needs: «Рецензування, експертна оцінка, опонування дисертацій»
 * becomes «дисертацій». Failing that, the whole label.
 */
export function variantLabel(type: PlanWorkType, itemTitle: string): string {
  if (type.shortLabel) return type.shortLabel;
  if (!itemTitle) return type.label;
  const prefix = itemTitle.replace(/[\s.,;:]+$/, '');
  if (!type.label.startsWith(prefix)) return type.label;
  const rest = type.label.slice(prefix.length).replace(/^[\s.,;:]+/, '');
  return rest || type.label;
}

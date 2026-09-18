'use client';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/aurora/ui/combobox';
import type { PlanWorkType } from '@/components/science/add-plan-row-dialog';

/**
 * «Вид роботи» — the Додаток III picker both the plan and the record dialog use.
 *
 * **A combobox, not a select** (owner, 2026-09-17). Twenty-six work types is
 * past the length where a list is a choice and into the length where it is a
 * search — the same reason `/stakes` swapped its кафедра select for one when an
 * ADMIN started seeing all thirty-one. Several labels here run to a full line
 * («Участь у конкурсі проєктів та науково-технічних розробок, які фінансуються
 * за рахунок коштів державного бюджету»), so scanning is worse here than there.
 *
 * Searching matches the label AND the пункт number, so somebody who knows the
 * наказ can type «12» and land on «Керівництво аспірантами».
 */
export function WorkTypeCombobox({
  workTypes,
  value,
  onChange,
}: {
  workTypes: PlanWorkType[];
  value: string;
  onChange: (next: string) => void;
}) {
  const selected = workTypes.find((t) => t.id === value);

  return (
    <Combobox
      items={workTypes}
      value={value}
      onChange={onChange}
      filter={(type: PlanWorkType, search) => {
        const needle = search.toLowerCase().trim();
        return (
          type.label.toLowerCase().includes(needle) ||
          // «12» finds «Керівництво аспірантами» — the наказ's own numbering
          // is how people who work with the document refer to these.
          type.itemNumber.startsWith(needle)
        );
      }}
      displayValue={selected ? `${selected.itemNumber} · ${selected.label}` : ''}
    >
      <p className="mb-1 block text-sm font-medium">Вид роботи</p>
      <ComboboxInput placeholder="Почніть вводити назву або номер пункту" aria-label="Вид роботи" />
      <ComboboxContent>
        <ComboboxEmpty>Нічого не знайдено</ComboboxEmpty>
        <ComboboxList<PlanWorkType>>
          {(type) => (
            <ComboboxItem key={type.id} value={type.id}>
              {type.itemNumber} · {type.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

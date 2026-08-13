'use client';

import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DEFAULT_LIMITS } from '@/lib/stake/formula';
import { formatStake } from '@/lib/stake/units';

/**
 * Explanations for the ставка vocabulary.
 *
 * «Кст», «Кнпп» and «за формулою» come straight out of the положення. They mean
 * something precise to whoever wrote it and nothing at all to the завідувач who
 * has to use this screen once a year — and two of them are routinely misread in
 * ways that change what somebody does:
 *
 *   Кнпп        looks like «who gets paid». It is a divisor, and nothing else.
 *   Разом       looks like it must fit inside Кст. It does not — the bonus is
 *               paid on top.
 *
 * So the wording says the misreading out loud rather than only the definition.
 * Each entry is one sentence of what it is, then one of what it is NOT or what
 * it is for.
 */
export const STAKE_TERMS = {
  kst: {
    title: 'Виділені ставки (Кст)',
    lines: [
      'Скільки ставок виділено кафедрі для розподілу між НПП. Встановлює адміністрація, завідувач змінити не може.',
      'Розподілити більше можна, але це доведеться пояснити у протоколі.',
    ],
  },
  knpp: {
    title: 'Кнпп — кількість НПП, які відповідають ліцензійним умовам',
    lines: [
      'Скільки НПП кафедри мають щонайменше 4 з 20 позицій ліцензійних умов (див. Характеристику).',
      'На розрахунок ставки не впливає — це показник, за яким оцінюють кафедру.',
    ],
  },
  distributed: {
    title: 'Розподілено',
    lines: [
      'Сума ставок, які ви призначили. Крок — 0,05.',
      'Може перевищити виділені ставки: збереження не блокується, але з’явиться попередження.',
    ],
  },
  remaining: {
    title: 'Нерозподілено',
    lines: [
      'Скільки з виділених ставок ще не роздано: виділено мінус розподілено.',
      'Саме цей залишок ви й розподіляєте вручну. Червоне число означає перевищення — його треба врахувати у протоколі.',
    ],
  },
  bonus: {
    title: 'Бонус за залучених здобувачів',
    lines: [
      'Додаткова ставка за вступників, яких залучив НПП. Рахується автоматично за нормативами і не входить до виділених ставок.',
      'Не може підняти людину вище її Макс. Хто вже отримав максимум із розподілу, більше не додасть — скільки б здобувачів не залучив.',
    ],
  },
  total: {
    title: 'Разом',
    lines: [
      'Скільки людина отримує насправді: розподілена частка плюс та частина бонусу, що вміщується під її Макс.',
      'Якщо частина бонусу не вмістилася, вона показана поруч. Це не помилка — щоб дати більше, потрібне рішення проректора і нова межа для цієї людини.',
    ],
  },
  formula: {
    title: 'За формулою',
    lines: [
      'Частка виділених ставок, яка припадає на цю людину: половина за її рейтингом, половина за скоригованою вагою, у межах її Макс.',
      'Це нижня межа, а не остаточне число: ставку можна лише збільшити відносно неї.',
    ],
  },
  formulaTotal: {
    title: 'Скільки пропонує формула на всю кафедру',
    lines: [
      'Сума всіх значень у колонці «За формулою» — з чого ви починаєте, якщо нічого не міняти.',
      'Може відрізнятися від виділених ставок на кілька сотих: кожне число округлюється до 0,05.',
    ],
  },
  min: {
    title: 'Мінімальна ставка',
    lines: [
      'Нижче цього значення людина отримати не може. Ніколи не буває меншим за 0,10 — без ставки не залишається ніхто.',
      'Встановлює лише адміністратор.',
    ],
  },
  max: {
    title: 'Максимальна ставка',
    lines: [
      'Стеля для цієї людини. Впливає і на формулу: чим вона нижча, тим меншу частку формула пропонує.',
      `Встановлює лише адміністратор. Бліде значення означає стандартну межу ${formatStake(DEFAULT_LIMITS.maxHundredths)}; її можна піднімати вище.`,
    ],
  },
  contractCoefficient: {
    title: 'Узгоджуючий коефіцієнт',
    lines: [
      'Множник для здобувачів, які навчаються за контрактом: бюджетний зараховується повністю, контрактний — із цим коефіцієнтом.',
      'Один на весь університет, не окремо для кожної кафедри. Змінює бонус за здобувачів усюди.',
    ],
  },
  sandbox: {
    title: 'Пісочниця',
    lines: [
      'Ставки, Мін і Макс тут існують лише для вас — нічого з цієї вкладки не потрапляє до НПП і нікому не виплачується.',
      'Значення зберігаються, щоб не вводити їх щоразу заново. Порожній Кст повертає справжній.',
    ],
  },
  deanReadonly: {
    title: 'Лише перегляд',
    lines: [
      'Ви бачите цю кафедру як декан факультету — усі дані відкриті, але розподіл зберігає її завідувач.',
      'Свою кафедру, якщо ви нею завідуєте, ви редагуєте як звичайно.',
    ],
  },
  realReadonly: {
    title: 'Лише перегляд',
    lines: [
      'Це те, що зберіг завідувач кафедри. Розподіл між НПП — його рішення, тому адміністратор його не змінює.',
      'Кст, Мін і Макс залишаються вашими. Щоб перевірити інші числа, відкрийте «Пісочницю».',
    ],
  },
  positions: {
    title: 'Позицій із 20',
    lines: [
      'Скільки з 20 позицій ліцензійних умов виконує ця людина за останні 5 років.',
      'Зелене (4 і більше) — входить до Кнпп. Червоне — не входить, але ставку однаково отримує.',
    ],
  },
} as const;

export type StakeTerm = keyof typeof STAKE_TERMS;

/** Small «i» that explains one term from the положення */
export function StakeTermHint({ term, className }: { term: StakeTerm; className?: string }) {
  const { title, lines } = STAKE_TERMS[term];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={title}
            className={
              className ??
              'inline-flex cursor-help align-middle text-muted-foreground/70 hover:text-foreground'
            }
          >
            <Info className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{title}</p>
            {lines.map((line) => (
              <p key={line} className="text-xs opacity-90">
                {line}
              </p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

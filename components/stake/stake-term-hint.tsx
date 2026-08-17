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
    title: 'Основний фонд ставок',
    lines: [
      'Скільки ставок виділено кафедрі для розподілу між НПП за рейтингом. Встановлює адміністрація, завідувач змінити не може.',
      'У положенні його позначають «Кст». Розподілити більше можна, але це доведеться пояснити у протоколі.',
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
      'Може перевищити фонд: збереження не блокується, але з’явиться попередження.',
    ],
  },
  remaining: {
    title: 'Нерозподілено',
    lines: [
      'Скільки з фондів кафедри ще не роздано: виділено мінус розподілено.',
      'Саме цей залишок ви й розподіляєте вручну. Червоне число означає перевищення — його треба врахувати у протоколі.',
    ],
  },
  bonus: {
    title: 'Здобувачі',
    lines: [
      'Скільки за нормативами варті вступники, яких залучив цей НПП. Рахується автоматично і показує, що людина зробила.',
      'До ставки НЕ додається. Це підстава для рішення, а не саме рішення — ставку призначає завідувач.',
    ],
  },
  bonusPool: {
    title: 'Бонусний фонд ставок',
    lines: [
      'Другий фонд кафедри, який адміністрація виділяє пізніше — за залучених здобувачів і адміністративні посади.',
      'Формула його не чіпає. Розподіляється лише вручну, тому основний розподіл від нього захищений.',
    ],
  },
  status: {
    title: 'Надбавка за посаду',
    lines: [
      'Скільки адміністрація визначила за адміністративну посаду цієї людини. Береться з профілю, вручну нічого не позначають.',
      'До ставки НЕ додається — як і здобувачі, це показник, а не виплата.',
    ],
  },
  recommended: {
    title: 'Рекомендовано',
    lines: [
      'Скільки людина заробила за об’єктивними показниками: за формулою + здобувачі + посада.',
      'Може перевищувати Макс — тоді видно, що людині належить більше, ніж дозволяє її межа. Це число ні на що не впливає саме собою.',
    ],
  },
  formula: {
    title: 'За формулою',
    lines: [
      'Частка основного фонду, яка припадає на цю людину: половина за її рейтингом, половина за скоригованою вагою, у межах її Макс.',
      'Це нижня межа, а не остаточне число: ставку можна лише збільшити відносно неї.',
    ],
  },
  formulaTotal: {
    title: 'Скільки пропонує формула на всю кафедру',
    lines: [
      'Сума всіх значень у колонці «За формулою» — з чого ви починаєте, якщо нічого не міняти.',
      'Може відрізнятися від фонду на кілька сотих: кожне число округлюється до 0,05.',
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
      'Один на весь університет, не окремо для кожної кафедри.',
    ],
  },
  deanReadonly: {
    title: 'Лише перегляд',
    lines: [
      'Ви бачите цю кафедру як декан факультету — усі дані відкриті, але розподіл зберігає її завідувач.',
      'Свою кафедру, якщо ви нею завідуєте, ви редагуєте як звичайно.',
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
export function StakeTermHint({
  term,
  className,
  extraLines,
}: {
  term: StakeTerm;
  className?: string;
  /**
   * Lines the caller computes — a worked example with the values actually in
   * force. `STAKE_TERMS` is static text and cannot hold «1 ÷ 13 × 0,175»,
   * because both numbers are settings somebody edits on the very screen the
   * hint sits on, and a stale example is worse than none.
   */
  extraLines?: string[];
}) {
  const { title, lines: base } = STAKE_TERMS[term];
  const lines = extraLines ? [...base, ...extraLines] : base;

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

'use client';

import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
    title: 'Кст — пул ставок кафедри',
    lines: [
      'Скільки ставок кафедра має розподілити між своїми НПП. Встановлює адміністрація, завідувач змінити не може.',
      'Сума в колонці «Розподілено» не може перевищити Кст.',
    ],
  },
  knpp: {
    title: 'Кнпп — кількість НПП, які відповідають ліцензійним умовам',
    lines: [
      'Скільки НПП кафедри мають щонайменше 4 з 20 позицій ліцензійних умов (див. Характеристику).',
      'Це лише дільник у формулі. Ставку отримують УСІ НПП кафедри, незалежно від цього числа.',
    ],
  },
  distributed: {
    title: 'Розподілено',
    lines: [
      'Сума ставок, які ви призначили. Крок — 0,05.',
      'Не може перевищити Кст: інакше зміни не збережуться.',
    ],
  },
  remaining: {
    title: 'Нерозподілено',
    lines: [
      'Скільки ставок із пулу ще не роздано: Кст мінус «Розподілено».',
      'Залишок — це нормально. Червоне число означає, що пул перевищено і треба комусь зменшити ставку.',
    ],
  },
  bonus: {
    title: 'Бонус за залучених здобувачів',
    lines: [
      'Додаткова ставка за вступників, яких залучив НПП. Рахується автоматично за нормативами.',
      'Виплачується ПОНАД Кст — не входить до пулу і не конкурує з колегами.',
    ],
  },
  total: {
    title: 'Разом',
    lines: [
      'Ставка людини: розподілена частка плюс бонус за здобувачів.',
      'Сума по кафедрі може бути більшою за Кст — рівно на суму бонусів.',
    ],
  },
  formula: {
    title: 'За формулою',
    lines: [
      'Скільки формула пропонує цій людині: 0,5 × (її рейтинг / середній по кафедрі) × (Кст / Кнпп).',
      'Це пропозиція, а не рішення. Завідувач може змінити число, вказавши обґрунтування.',
    ],
  },
  limits: {
    title: 'Мінімальна і максимальна ставка',
    lines: [
      'Межі, у яких може бути ставка цієї людини. Мінімум ніколи не буває меншим за 0,10 — без ставки не залишається ніхто.',
      'Встановлює лише адміністратор. Якщо значення бліді — діють стандартні межі 0,10 / 1,50.',
    ],
  },
  positions: {
    title: 'Позицій із 20',
    lines: [
      'Скільки з 20 позицій ліцензійних умов виконує ця людина за останні 5 років.',
      'Зелене (4 і більше) — входить до Кнпп. Червоне — не входить, але ставку однаково отримує.',
    ],
  },
  justification: {
    title: 'Обґрунтування',
    lines: [
      'Чому ставка відрізняється від тієї, що пропонує формула.',
      'Обов’язкове: без нього зміни не збережуться. Потрапляє в додаток 2.',
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

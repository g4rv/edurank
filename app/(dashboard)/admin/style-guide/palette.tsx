import { cn } from '@/lib/utils';

/**
 * The palette, as the app actually defines it.
 *
 * **Every swatch paints itself with the real custom property**, never with a
 * copied hex. If a token changes in `globals.css` this page changes with it;
 * if it is deleted, the swatch goes transparent and says so by being invisible.
 * A style guide that hardcodes its own colours is a screenshot with extra steps
 * — it drifts from the app the first time somebody edits a value, and then it
 * lies confidently.
 *
 * The hex and contrast figures ARE written down, because a browser cannot
 * measure them for us here: `getComputedStyle` serialises to `oklab()` in
 * current Chrome (§12), so scraping numbers out of it yields lab components
 * pretending to be RGB. They were measured by compositing on a canvas, the way
 * §3 requires, and each one is recorded beside the value it belongs to.
 */

type Token = {
  /** The custom property, exactly as written in `globals.css` */
  name: string;
  /** How a component reaches it — the Tailwind utility, not the variable */
  use: string;
  /** The light-mode value, for reading beside the swatch */
  value: string;
  /** Composited hex in light mode */
  hex: string;
  /** Measured contrast, and against what. Omitted where it means nothing. */
  contrast?: string;
  /** What this colour is FOR. The part a hex cannot tell you. */
  note: string;
  /** Paint the swatch as text on a surface rather than as a filled block */
  asText?: boolean;
  /** The surface the swatch sits on, when it is not a card */
  on?: string;
};

type Group = { title: string; blurb: string; tokens: Token[] };

const GROUPS: Group[] = [
  {
    title: 'Бренд',
    blurb:
      'Хюe 264 — колір університету #4472C4. Означає одне: основну дію, активну вкладку, посилання назовні та одну акцентну фігуру. Більше нічого.',
    tokens: [
      {
        name: '--brand',
        use: 'bg-brand · text-brand',
        value: 'oklch(0.556 0.132 264)',
        hex: '#4b70c0',
        contrast: '4.80 на картці',
        note: 'Основна дія, активна вкладка, зовнішнє посилання.',
      },
      {
        name: '--brand-strong',
        use: 'text-brand-strong',
        value: 'oklch(0.45 0.13 266)',
        hex: '#3a5aa8',
        contrast: '6.76 на bg-brand/10',
        note: 'Тільки для тексту на брендовій підкладці: --brand там дає 4.24 — нижче AA, бо підкладка піднімає тло до тексту.',
      },
      {
        name: '--brand-foreground',
        use: 'text-brand-foreground',
        value: 'oklch(0.985 0 0)',
        hex: '#fafafa',
        note: 'Текст на суцільній брендовій заливці.',
      },
      {
        name: '--gold',
        use: 'text-gold',
        value: 'oklch(0.76 0.13 70)',
        hex: '#d4a04a',
        note: 'Другий колір герба. Тільки в знаку — не статус і не акцент.',
      },
    ],
  },
  {
    title: 'Чорнило й нейтральні',
    blurb:
      'Той самий хюe 264, але хрома 0.02 замість 0.13 — це і є вся різниця між «хромом» і «акцентом». Три сили тексту, а не дві: основний, мʼякший для міток і заголовків колонок, і тихий для мети.',
    tokens: [
      {
        name: '--foreground',
        use: 'text-foreground',
        value: 'oklch(0.145 0.012 264)',
        hex: '#080a0f',
        contrast: '19.8 на картці',
        asText: true,
        note: 'Основний текст, значення, назви.',
      },
      {
        name: '--foreground-soft',
        use: 'text-foreground-soft',
        value: 'oklch(0.42 0.022 264)',
        hex: '#474d59',
        contrast: '8.49 на картці · 7.92 на тлі',
        asText: true,
        note: 'Підписи, заголовки колонок, другорядні значення — те, що ЧИТАЮТЬ, але що не є основним текстом. До 2026-09-11 цього рівня не було, і мітки падали в найтихіший колір на сторінці.',
      },
      {
        name: '--muted-foreground',
        use: 'text-muted-foreground',
        value: 'oklch(0.52 0.02 264)',
        hex: '#636975',
        contrast: '5.51 на картці · 5.15 на тлі',
        asText: true,
        note: 'Мета, лічильники, підказки — те, на що кидають оком, а не читають. Було 4.76; піднято разом із появою рівня вище.',
      },
      {
        name: '--placeholder',
        use: 'placeholder:text-placeholder',
        value: 'oklch(0.568 0.02 264)',
        hex: '#717783',
        contrast: '4.50 на картці',
        asText: true,
        note: 'Підказка в полі та в тригері селекта. Світліша за текст, але тримає AA — інакше порожній фільтр читається як вимкнений.',
      },
      {
        name: '--mask-ghost',
        use: 'text-mask-ghost',
        value: 'oklch(0.556 0.02 264 / 0.55)',
        hex: '#b3b6bd',
        contrast: '2.12 на картці',
        asText: true,
        note: 'Лише хвіст маски за кареткою. Навмисно нижче AA: це не контент, і воно ніколи не єдине в полі.',
      },
    ],
  },
  {
    title: 'Поверхні',
    blurb:
      'Чотири поверхні, і нічого не вигадується для окремого екрана. На світлій сторінці поверхня відділяється тим, що СВІТЛІШАЄ і бере рамку — ніколи тим, що темнішає.',
    tokens: [
      {
        name: '--background',
        use: 'bg-background',
        value: 'oklch(0.977 0.004 265)',
        hex: '#f6f7fa',
        note: 'Земля сторінки. Ніколи не біла — інакше картці немає від чого відділятися.',
      },
      {
        name: '--card',
        use: 'bg-card',
        value: 'oklch(1 0 0)',
        hex: '#ffffff',
        note: 'Єдина чиста біла поверхня, і вона навмисно БЕЗ тону: це найсвітліше на екрані, і тонування забирає в неї цю роль.',
      },
      {
        name: '--muted',
        use: 'bg-muted',
        value: 'oklch(0.97 0.006 264)',
        hex: '#f3f5f9',
        contrast: '1.09 на картці',
        note: 'Смуга всередині картки — групувальний рядок таблиці. НЕ для відділення чогось на сторінці: там пара вимірюється 1.02.',
      },
      {
        name: '--table-group',
        use: 'bg-table-group',
        value: 'oklch(0.955 0.014 264)',
        hex: '#eef1f8',
        note: 'Заголовок розділу в таблиці. Суцільний, бо рядок липкий і крізь напівпрозорий було б видно рядки під ним.',
      },
    ],
  },
  {
    title: 'Лінії',
    blurb:
      '--border малює роздільники, --input малює межу контролю. Це різні роботи з різними порогами.',
    tokens: [
      {
        name: '--border',
        use: 'border-border',
        value: 'oklch(0.87 0.012 264)',
        hex: '#d0d4dc',
        contrast: '1.49 на картці',
        note: 'Роздільники й краї карток. Не контрол — порога 3.0 не потребує, інакше кожна таблиця стає кліткою.',
      },
      {
        name: '--input',
        use: 'border-input',
        value: 'oklch(0.668 0.018 264)',
        hex: '#8f95a0',
        contrast: '3.01 на картці',
        note: 'Межа контролю. Тримає WCAG 1.4.11 — 3.0 це точка, з якої край контролю надійно видно.',
      },
      {
        name: '--ring',
        use: 'ring-ring',
        value: 'oklch(0.708 0.016 264)',
        hex: '#9ca1ab',
        note: 'Нейтральне кільце фокуса. Контроли «Аврори» беруть замість нього ring-brand/25.',
      },
    ],
  },
  {
    title: 'Статус',
    blurb:
      'Єдині кольори, що ЙДУТЬ з хюe 264 — саме тому, що їхня робота не належати до меблів. Кожен — пара: --x для тексту, --x-surface для підкладки. До 2026-09-11 їх не існувало, і 160 місць у коді вигадували власні відтінки: «ok» був написаний вісьмома способами, «pending» — дванадцятьма.',
    tokens: [
      {
        name: '--success',
        use: 'text-success',
        value: 'oklch(0.52 0.14 150)',
        hex: '#0a7e3a',
        contrast: '5.17 на картці · 4.55 на своїй підкладці',
        asText: true,
        note: 'Зроблено, підтверджено, перевірено. Валідний DOI чи ISBN.',
      },
      {
        name: '--success-surface',
        use: 'bg-success-surface',
        value: 'oklch(0.95 0.045 150)',
        hex: '#daf8df',
        note: 'Заливка зеленого значка.',
      },
      {
        name: '--warning',
        use: 'text-warning',
        value: 'oklch(0.52 0.13 70)',
        hex: '#975800',
        contrast: '5.66 на картці · 4.87 на своїй підкладці',
        asText: true,
        note: 'Очікує, потребує уваги: «Не активовано», «не вказано», «Сумісник». Тільки значки — ніколи хром.',
      },
      {
        name: '--warning-surface',
        use: 'bg-warning-surface',
        value: 'oklch(0.95 0.05 80)',
        hex: '#ffecc9',
        note: 'Заливка бурштинового значка.',
      },
      {
        name: '--error',
        use: 'bg-error',
        value: 'oklch(0.577 0.245 27.325)',
        hex: '#e7000b',
        contrast: 'білий на ньому — 4.57',
        note: 'Руйнівна дія або помилка. Раніше --destructive; варіант кнопки досі зветься destructive, і це правильно — варіант описує дію, токен описує колір.',
      },
      {
        name: '--error-strong',
        use: 'text-error-strong',
        value: 'oklch(0.52 0.21 27)',
        hex: '#c50516',
        contrast: '5.15 на своїй підкладці',
        asText: true,
        note: 'Червоний текст на червоній підкладці. --error там дає 3.98 — нижче AA, з тієї ж причини, що й --brand-strong.',
      },
      {
        name: '--error-surface',
        use: 'bg-error-surface',
        value: 'oklch(0.95 0.04 27)',
        hex: '#ffe5e0',
        note: 'Заливка червоного значка.',
      },
    ],
  },
  {
    title: 'Графіки',
    blurb:
      'Колір позначає СЕРІЮ, а не оздоблення. Один акцент для однієї серії; друга барва — лише там, де серій справді дві. Ця пара повторює друковані звіти університету.',
    tokens: [
      {
        name: '--chart-accent',
        use: 'fill-chart-accent',
        value: 'oklch(0.556 0.132 264)',
        hex: '#4b70c0',
        note: 'Одна серія на графіку. Той самий синій, що й у Word-звітах кафедр.',
      },
      {
        name: '--chart-total',
        use: 'fill-chart-total',
        value: 'oklch(0.505 0.208 27)',
        hex: '#bd2025',
        note: 'Стовпчик «Загальний бал» поруч із розділом. Червоний тут — не попередження, а їхній фірмовий стиль.',
      },
    ],
  },
];

function Swatch({ token }: { token: Token }) {
  return (
    <div className="flex gap-4 rounded-xl border bg-card p-4 shadow-card">
      {/* The swatch paints itself from the live variable. `asText` shows the
          colour doing its real job — a colour meant for 14px text tells you
          nothing as a 56px block, because contrast is a property of the pair
          and of the SIZE it is read at. */}
      {token.asText ? (
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-card text-2xl font-semibold"
          style={{ color: `var(${token.name})` }}
        >
          Аа
        </div>
      ) : (
        <div
          className="size-14 shrink-0 rounded-lg border"
          style={{ background: `var(${token.name})` }}
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-semibold">{token.name}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{token.use}</p>
        <p className="mt-2 text-sm">{token.note}</p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {token.value} · {token.hex}
          {token.contrast ? ` · ${token.contrast}` : ''}
        </p>
      </div>
    </div>
  );
}

export function Palette() {
  return (
    <div className="space-y-10">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="text-sm font-semibold tracking-wide text-foreground uppercase">
            {group.title}
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-foreground-soft">{group.blurb}</p>
          <div className={cn('mt-4 grid gap-4', 'md:grid-cols-2 xl:grid-cols-3')}>
            {group.tokens.map((t) => (
              <Swatch key={t.name} token={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

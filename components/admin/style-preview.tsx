'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// A comparison tool, so the page's own chrome stays out of the way: every
// candidate is rendered from the same markup, side by side, and the only thing
// that differs between them is the token set. Styling this page distinctively
// would bias the very comparison it exists to support.

interface Preset {
  key: string;
  name: string;
  note: string;
  /** CSS custom properties layered over the theme for this candidate */
  light: Record<string, string>;
  dark: Record<string, string>;
}

// Every candidate stays inside the direction CLAUDE.md sets — gray chrome, hue
// reserved for status. What varies is neutral temperature, how hard a
// separator is drawn, and corner radius. Nothing here introduces a brand hue.
const PRESETS: Preset[] = [
  {
    key: 'current',
    name: 'Поточний',
    note: 'Те, що зараз у застосунку',
    light: {},
    dark: {},
  },
  {
    key: 'warm',
    name: 'Теплий',
    note: 'Ті самі сірі, але з ледь теплим відтінком — менше «лікарняного» вигляду',
    light: {
      '--background': 'oklch(0.99 0.008 80)',
      '--card': 'oklch(1 0.005 80)',
      '--muted': 'oklch(0.955 0.014 80)',
      '--border': 'oklch(0.86 0.016 80)',
      '--input': 'oklch(0.665 0.022 80)',
      '--muted-foreground': 'oklch(0.552 0.018 80)',
    },
    dark: {
      '--background': 'oklch(0.152 0.009 80)',
      '--card': 'oklch(0.212 0.011 80)',
      '--muted': 'oklch(0.278 0.013 80)',
    },
  },
  {
    key: 'cool',
    name: 'Прохолодний',
    note: 'Синюватий нейтральний — типовий для адміністративних систем',
    light: {
      '--background': 'oklch(0.99 0.01 250)',
      '--card': 'oklch(1 0.006 250)',
      '--muted': 'oklch(0.955 0.018 250)',
      '--border': 'oklch(0.86 0.022 250)',
      '--input': 'oklch(0.665 0.03 250)',
      '--muted-foreground': 'oklch(0.552 0.026 250)',
    },
    dark: {
      '--background': 'oklch(0.152 0.013 250)',
      '--card': 'oklch(0.212 0.016 250)',
      '--muted': 'oklch(0.278 0.018 250)',
    },
  },
  {
    key: 'sharp',
    name: 'Чіткіший',
    note: 'Жорсткіші лінії та менші заокруглення — ближче до таблиці, ніж до картки',
    light: {
      '--radius': '0.375rem',
      '--border': 'oklch(0.78 0 0)',
      '--muted': 'oklch(0.945 0 0)',
    },
    dark: {
      '--radius': '0.375rem',
      '--border': 'oklch(1 0 0 / 28%)',
      '--muted': 'oklch(0.3 0 0)',
    },
  },
  {
    key: 'soft',
    name: 'М’якший',
    note: 'Більші заокруглення, тихіші межі — спокійніший, менш «канцелярський»',
    light: {
      '--radius': '0.875rem',
      '--border': 'oklch(0.9 0 0)',
      '--muted': 'oklch(0.975 0 0)',
    },
    dark: {
      '--radius': '0.875rem',
      '--border': 'oklch(1 0 0 / 12%)',
      '--muted': 'oklch(0.25 0 0)',
    },
  },
];

interface Ratios {
  input: number;
  border: number;
}

/**
 * WCAG ratio of a candidate's boundary tokens against its own surface, read
 * from real paint. Sampling beats arithmetic here because the tokens are oklch
 * and the dark ones are translucent white — both need the browser to resolve.
 */
function measure(el: HTMLElement): Ratios | null {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const rgb = (css: string, over?: string) => {
    ctx.clearRect(0, 0, 1, 1);
    if (over) {
      ctx.fillStyle = over;
      ctx.fillRect(0, 0, 1, 1);
    }
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]] as const;
  };
  const lum = (c: readonly [number, number, number]) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    // `a` is drawn over `b`, so a translucent token resolves against its surface
    const [l1, l2] = [lum(rgb(a, b)), lum(rgb(b))].sort((x, y) => y - x);
    return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
  };

  const cs = getComputedStyle(el);
  const surface = cs.getPropertyValue('--card').trim();
  return {
    input: ratio(cs.getPropertyValue('--input').trim(), surface),
    border: ratio(cs.getPropertyValue('--border').trim(), surface),
  };
}

/** The same markup for every candidate — only the tokens around it differ */
function Sample() {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Дані відділу</p>
          <p className="text-sm text-muted-foreground">Навчально-науковий відділ — 2026 рік</p>
        </div>
        <Button size="sm">Зберегти</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Дисципліна</label>
          <Input placeholder="Наприклад, Алгоритми" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Вид роботи</label>
          <Select defaultValue="dev">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dev">Розроблення — до 150 балів</SelectItem>
              <SelectItem value="upd">Оновлення — до 50 балів</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <Switch defaultChecked />
        <span>
          Конспекти лекцій <span className="text-muted-foreground">— 50 балів</span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline">
          Скасувати
        </Button>
        <Button size="sm" variant="secondary">
          Чернетка
        </Button>
        <Button size="sm" variant="ghost">
          Очистити
        </Button>
      </div>

      {/* Status hues are the one place colour is allowed off the chart palette */}
      <div className="flex flex-wrap gap-2 text-xs font-medium">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Зараховано</span>
        <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-green-700 dark:text-green-400">
          Перевірено
        </span>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-500">
          Не активовано
        </span>
        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
          Вилучено
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted text-left">
              <th className="px-3 py-2 font-medium">НПП</th>
              <th className="px-3 py-2 font-medium">3.4 НДР</th>
              <th className="px-3 py-2 text-right font-medium">Бали</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Бойко К. В.', '300', '1250'],
              ['Бондаренко О. В.', '—', '890'],
            ].map(([name, ndr, total]) => (
              <tr key={name} className="border-b last:border-b-0">
                <td className="px-3 py-2">{name}</td>
                <td className="px-3 py-2">
                  <span className="rounded-md border px-2 py-0.5 tabular-nums">{ndr}</span>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Candidate({ preset, dark }: { preset: Preset; dark: boolean }) {
  const [ratios, setRatios] = useState<Ratios | null>(null);

  // A callback ref rather than an effect: it fires once the node is attached
  // and its tokens resolve, which is exactly when there is something to
  // measure. The `key` below remounts on a theme or preset change, so this
  // runs again without needing a dependency list.
  const read = useCallback((el: HTMLDivElement | null) => {
    if (el) setRatios(measure(el));
  }, []);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{preset.name}</h2>
        {ratios && (
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            поле {ratios.input.toFixed(2)}
            <span className={cn(ratios.input < 3 && 'text-destructive')}>
              {ratios.input < 3 ? ' ✕' : ' ✓'}
            </span>
            {' · '}
            лінія {ratios.border.toFixed(2)}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{preset.note}</p>

      {/* The candidate's own tokens live here; `dark` flips the base set first */}
      <div
        key={`${preset.key}-${dark}`}
        ref={read}
        // text-foreground is required, not cosmetic: flipping the tokens changes
        // what --foreground *is*, but colour is inherited, so without re-applying
        // it here the preview keeps the page's light text on a dark surface.
        className={cn('rounded-xl bg-background p-3 text-foreground', dark && 'dark')}
        style={(dark ? preset.dark : preset.light) as React.CSSProperties}
      >
        <Sample />
      </div>
    </section>
  );
}

export function StylePreview() {
  const [dark, setDark] = useState(false);
  const [only, setOnly] = useState<string | null>(null);

  const shown = only ? PRESETS.filter((p) => p.key === only) : PRESETS;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={only ? 'outline' : 'secondary'} onClick={() => setOnly(null)}>
          Усі поруч
        </Button>
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={only === p.key ? 'secondary' : 'outline'}
            onClick={() => setOnly(p.key)}
          >
            {p.name}
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setDark((v) => !v)}
          aria-pressed={dark}
        >
          {dark ? 'Показати світлу' : 'Показати темну'}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Однакова розмітка в кожному варіанті — відрізняються лише кольори, товщина ліній і
        заокруглення. Числа праворуч: контраст межі поля та лінії таблиці до поверхні. Межа поля має
        бути <b>≥ 3.00</b> (WCAG 1.4.11) — інакше поле не видно на тлі.
      </p>

      <div className={cn('grid gap-8', !only && 'xl:grid-cols-2')}>
        {shown.map((p) => (
          <Candidate key={p.key} preset={p} dark={dark} />
        ))}
      </div>
    </div>
  );
}

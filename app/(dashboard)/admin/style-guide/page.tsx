import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Palette } from './palette';
import { ControlsGallery } from './gallery';

/**
 * «Аврора» in one page — the palette, the type scale, the surfaces, and every
 * control beside the shadcn one it replaces.
 *
 * ADMIN-only and unlinked, like `/admin/design` and `/admin/rating-debug`.
 *
 * **It absorbed `/admin/controls`** (owner, 2026-09-11), which held the gallery
 * alone. Three service pages describing one design system is two too many: the
 * palette belongs beside the controls that wear it, because most questions are
 * about the PAIR — «is this the right grey for a label» is answered by looking
 * at a label, not at a swatch.
 *
 * Nothing here is stored and nothing is a permission boundary. It renders the
 * real components against the real tokens, which is the only way a style guide
 * stays true: the moment it copies a hex, it starts lying the next time
 * somebody edits `globals.css`.
 */
export default async function StyleGuidePage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  return (
    <div className="space-y-10">
      <Breadcrumbs items={[{ label: 'Адміністрування' }, { label: 'Стиль' }]} />

      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Стиль «Аврора»</h1>
        <p className="mt-1 max-w-3xl text-sm text-foreground-soft">
          Палітра, шрифт, поверхні та контроли. Правила живуть у{' '}
          <span className="font-mono">docs/aurora.md</span> — ця сторінка лише показує, що з них
          вийшло. Нічого тут не зберігається.
        </p>
      </div>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.01em]">Палітра</h2>
        <p className="mt-1 max-w-3xl text-sm text-foreground-soft">
          Один хюe — 264, колір університету — і хрома каже, для чого колір: 0,00–0,02 це хром, 0,13
          це акцент. Статуси навмисно йдуть з цього хюe. Кожен зразок малюється живою змінною, тож
          сторінка не може розійтися з застосунком.
        </p>
        <div className="mt-6">
          <Palette />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.01em]">Шрифт</h2>
        <p className="mt-1 max-w-3xl text-sm text-foreground-soft">
          Manrope, і шкала Tailwind без змін. Більшу шкалу збудували й відкинули 2026-09-11:
          відповідь на «не бачу» — це зум браузера, який масштабує сторінку в тих пропорціях, у яких
          її намальовано.
        </p>
        <div className="mt-4 space-y-3 rounded-xl border bg-card p-5 shadow-card">
          {(
            [
              ['text-2xl font-semibold tracking-[-0.01em]', '24px', 'Заголовок сторінки'],
              ['text-sm font-semibold tracking-wide uppercase', '14px', 'Заголовок картки'],
              ['text-sm', '14px', 'Текст і значення'],
              ['text-sm text-foreground-soft', '14px', 'Підзаголовок сторінки'],
              ['text-sm font-medium text-foreground-soft', '14px', 'Мітка поля'],
              ['text-xs text-muted-foreground', '12px', 'Мета, лічильники'],
            ] as const
          ).map(([cls, size, label]) => (
            <div key={cls} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className={cls}>{label}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {size} · {cls}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.01em]">Поверхні та висота</h2>
        <p className="mt-1 max-w-3xl text-sm text-foreground-soft">
          Чотири поверхні, і нічого не вигадується для окремого екрана. Кожна тінь — два шари:
          щільна контактна й широка розсіяна. Одна пласка тінь читається як наліпка.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ['bg-card border shadow-xs', 'shadow-xs', 'Контроли — кнопки, поля, таб-бар'],
              ['bg-card border shadow-card', 'shadow-card', 'Картки'],
              ['bg-card border shadow-float', 'shadow-float', 'Те, що плаває над карткою'],
              ['glass', '.glass', 'Скло — розмите, тільки для малої панелі'],
            ] as const
          ).map(([cls, name, note]) => (
            <div key={name} className={`rounded-xl p-4 ${cls}`}>
              <p className="font-mono text-sm font-semibold">{name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.01em]">Контроли</h2>
        <p className="mt-1 max-w-3xl text-sm text-foreground-soft">
          Ліворуч — те, що в застосунку зараз, праворуч — заміна. Наведіть і клацніть: фокус і
          наведення не можна показати статично.
        </p>
        <div className="mt-6">
          <ControlsGallery />
        </div>
      </section>
    </div>
  );
}

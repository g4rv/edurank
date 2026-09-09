import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ControlsGallery } from './gallery';

/**
 * Service page — every «Аврора» control beside the shadcn one it replaces.
 *
 * ADMIN-only and unlinked, like `/admin/design` and `/admin/rating-debug`.
 *
 * Side by side rather than alone, because a control is never judged on its own:
 * the question is always «is this better than what is there», and half of these
 * changes are a few percent of fill or a different focus ring. Shown apart, two
 * text fields look identical; shown in one row, they do not.
 *
 * Every state that can be forced is forced — disabled, invalid, filled, empty,
 * both sizes. Focus and hover cannot be, so try them.
 */
export default async function ControlsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Адміністрування' }, { label: 'Контроли' }]} />

      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Контроли «Аврора»</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Ліворуч — те, що в застосунку зараз, праворуч — заміна. Нічого тут не зберігається.
          Наведіть і клацніть: фокус і наведення не можна показати статично.
        </p>
      </div>

      <ControlsGallery />
    </div>
  );
}

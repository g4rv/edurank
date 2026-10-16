import { redirect } from 'next/navigation';
import { Manrope } from 'next/font/google';
import { auth } from '@/lib/auth';
import { ConceptAurora } from '@/components/admin/concepts-glass';

// Service page: the «Аврора» concept the app's visual identity was chosen from.
// ADMIN-only, no nav link — same treatment as /admin/rating-debug. Changes
// nothing; it only previews. The rules that came out of it live in
// docs/aurora.md.
//
// Six rival concepts used to sit here beside it (owner, 2026-10-15: removed).
// Their extra Google fonts were fetched at build time, and one of them broke a
// production build when Google served its files in a form next/font could not
// read — a page nobody uses must not be able to stop a deploy.

// The concept reads `--dc-manrope`; the app's own Manrope comes from app/layout.tsx.
const manrope = Manrope({
  variable: '--dc-manrope',
  subsets: ['latin', 'cyrillic'],
});

export default async function DesignPreviewPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  return (
    <div className={`space-y-6 ${manrope.variable}`}>
      <div>
        <h1 className="text-2xl font-semibold">Обличчя застосунку — «Аврора»</h1>
        <p className="mt-1 max-w-3xl text-sm text-foreground-soft">
          Скло на градієнті Stripe: три кольорові плями внизу, дрібне зерно поверх них, а на цьому
          матові панелі з розмиттям і світлою волосінню по верхньому краю. Показано на екрані
          «Розподіл ставок» із прикладовими даними. Нічого тут не зберігається.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <ConceptAurora />
      </div>
    </div>
  );
}

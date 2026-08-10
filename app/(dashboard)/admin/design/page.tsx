import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AnimatedPage } from '@/components/ui/animated-page';
import { StylePreview } from '@/components/admin/style-preview';

// Service page for choosing the app's visual direction: the same components
// under several candidate token sets, side by side. ADMIN-only, no nav link —
// same treatment as /admin/rating-debug. Changes nothing; it only previews.
export default async function DesignPreviewPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Варіанти оформлення</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Оберіть напрям — я застосую його до всього застосунку. Нічого тут не зберігається.
        </p>
      </div>

      <StylePreview />
    </AnimatedPage>
  );
}

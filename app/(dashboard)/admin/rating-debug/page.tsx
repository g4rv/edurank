import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { RatingDebugPlayground } from '@/components/rating/debug-playground';

// Dev/QA tool: renders every 2026 evidence form and computes the score locally.
// ADMIN-only; carries no data-changing actions.
export default async function RatingDebugPage() {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Рейтинг — тест форм (2026)</h1>
        <p className="text-sm text-muted-foreground">
          Службова сторінка: перегляд форм доказів та перевірка обчислення балів для всіх типів
          показників.
        </p>
      </div>
      <RatingDebugPlayground />
    </div>
  );
}

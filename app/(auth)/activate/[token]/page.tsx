import Link from 'next/link';
import { findStaffByActivationToken } from '@/lib/activation';
import { ActivateForm } from './activate-form';

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const staff = await findStaffByActivationToken(token);

  if (!staff) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight">EduRank</h1>
        <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
          <p className="text-sm">Посилання недійсне або протерміноване.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Діє лише останнє надіслане посилання — перевірте, чи немає в пошті новішого листа. Якщо
            його немає, скористайтеся відновленням пароля або зверніться до адміністратора.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline"
          >
            До сторінки входу
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ActivateForm
      token={token}
      fullName={`${staff.lastName} ${staff.firstName} ${staff.patronymic}`}
      email={staff.email}
    />
  );
}

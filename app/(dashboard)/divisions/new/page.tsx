import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { DivisionForm } from '@/components/division/division-form';
import { createDivision } from '@/app/(dashboard)/divisions/actions';

export default async function NewDivisionPage() {
  const session = await auth();

  if (session?.user.role !== 'ADMIN') redirect('/divisions');

  return (
    <div className="max-w-lg space-y-6">
      <Link
        href="/divisions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Відділи
      </Link>

      <h1 className="text-2xl font-semibold">Новий відділ</h1>

      <DivisionForm action={createDivision} submitLabel="Створити" />
    </div>
  );
}

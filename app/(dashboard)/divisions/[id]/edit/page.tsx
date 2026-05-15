import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { DivisionForm } from '@/components/division/division-form';
import { updateDivision } from '@/app/(dashboard)/divisions/actions';

export default async function EditDivisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  if (session?.user.role !== 'ADMIN') redirect('/divisions');

  const division = await db.division.findUnique({
    where: { id },
    select: { name: true },
  });

  if (!division) notFound();

  return (
    <div className="max-w-lg space-y-6">
      <Link
        href="/divisions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Відділи
      </Link>

      <h1 className="text-2xl font-semibold">Редагувати: {division.name}</h1>

      <DivisionForm
        defaultValues={{ name: division.name }}
        action={updateDivision.bind(null, id)}
        submitLabel="Зберегти"
      />
    </div>
  );
}

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getEditableFields } from '@/lib/field-access';
import { notFound, redirect } from 'next/navigation';
import ProfessorForm from './components/professor-form';
import { Container } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ProfessorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  const [professor, sessionUser] = await Promise.all([
    prisma.professor.findUnique({
      where: { id },
      include: {
        department: { include: { faculty: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: { division: true },
    }),
  ]);

  if (!professor) notFound();

  const editableFields = getEditableFields(
    session.user.role,
    sessionUser?.division?.name
  );

  return (
    <main className="flex-1 bg-zinc-50 py-8">
      <Container size="narrow">
        <ProfessorForm professor={professor} editableFields={editableFields} />
      </Container>
    </main>
  );
}

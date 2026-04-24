import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Container } from '@/components/ui';
import { FacultySection } from './components/faculty-section';

export const dynamic = 'force-dynamic';

export default async function FacultiesPage() {
  const session = await auth();
  if (!session || !['ADMIN', 'EDITOR'].includes(session.user.role))
    redirect('/');

  const faculties = await prisma.faculty.findMany({ orderBy: { name: 'asc' } });

  return (
    <main className="flex-1 bg-zinc-50 py-8">
      <Container>
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">
          Факультети
        </h1>
        <FacultySection faculties={faculties} />
      </Container>
    </main>
  );
}

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Container } from '@/components/ui';
import { DepartmentSection } from './components/department-section';

export const dynamic = 'force-dynamic';

export default async function DepartmentsPage() {
  const session = await auth();
  if (!session || !['ADMIN', 'EDITOR'].includes(session.user.role))
    redirect('/');

  const [departments, faculties] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: {
        faculty: { select: { name: true } },
        professors: {
          select: { lastName: true, firstName: true },
          orderBy: { lastName: 'asc' },
        },
      },
    }),
    prisma.faculty.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <main className="flex-1 bg-zinc-50 py-8">
      <Container>
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Кафедри</h1>
        <DepartmentSection departments={departments} faculties={faculties} />
      </Container>
    </main>
  );
}

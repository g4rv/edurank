import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Container } from '@/components/ui';
import { DivisionSection } from './components/division-section';

export const dynamic = 'force-dynamic';

export default async function DivisionsPage() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') redirect('/');

  const divisions = await prisma.division.findMany({
    orderBy: { name: 'asc' },
    include: {
      users: { select: { email: true }, orderBy: { email: 'asc' } },
    },
  });

  return (
    <main className="flex-1 bg-zinc-50 py-8">
      <Container>
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Відділи</h1>
        <DivisionSection divisions={divisions} />
      </Container>
    </main>
  );
}

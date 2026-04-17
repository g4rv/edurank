import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { Prisma } from '@/generated/prisma/client';
import { NextResponse } from 'next/server';

export async function GET() {
  const professors = await prisma.professor.findMany({
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: {
      department: {
        select: {
          id: true,
          name: true,
          faculty: { select: { id: true, name: true } },
        },
      },
    },
  });
  return NextResponse.json(professors);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role === 'VIEWER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  if (!body.firstName?.trim()) {
    return NextResponse.json(
      { error: 'firstName is required' },
      { status: 400 }
    );
  }
  if (!body.lastName?.trim()) {
    return NextResponse.json(
      { error: 'lastName is required' },
      { status: 400 }
    );
  }
  if (!body.departmentId) {
    return NextResponse.json(
      { error: 'departmentId is required' },
      { status: 400 }
    );
  }

  try {
    const professor = await prisma.professor.create({
      data: {
        lastName: body.lastName.trim(),
        firstName: body.firstName.trim(),
        patronymic: body.patronymic?.trim() || null,
        departmentId: body.departmentId,
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            faculty: { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json(professor, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 400 }
      );
    }
    throw error;
  }
}

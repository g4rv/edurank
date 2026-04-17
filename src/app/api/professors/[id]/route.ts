import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { Prisma } from '@/generated/prisma/client';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const professor = await prisma.professor.findUnique({
    where: { id },
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
  if (!professor)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(professor);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role === 'VIEWER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
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
    const professor = await prisma.professor.update({
      where: { id },
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
    return NextResponse.json(professor);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025')
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.code === 'P2003')
        return NextResponse.json(
          { error: 'Department not found' },
          { status: 400 }
        );
    }
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  try {
    await prisma.professor.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }
}

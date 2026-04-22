import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { Prisma } from '@/generated/prisma/client';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const faculty = await prisma.faculty.findUnique({
    where: { id },
    include: { departments: { orderBy: { name: 'asc' } } },
  });
  if (!faculty)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(faculty);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role === 'USER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  try {
    const faculty = await prisma.faculty.update({
      where: { id },
      data: { name: body.name.trim() },
    });
    return NextResponse.json(faculty);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025')
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.code === 'P2002')
        return NextResponse.json(
          { error: 'A faculty with this name already exists' },
          { status: 409 }
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
    await prisma.faculty.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025')
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.code === 'P2003')
        return NextResponse.json(
          { error: 'Cannot delete — faculty still has departments' },
          { status: 409 }
        );
    }
    throw error;
  }
}

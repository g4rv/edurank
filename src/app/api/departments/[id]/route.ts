import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { Prisma } from '@/generated/prisma/client';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const department = await prisma.department.findUnique({
    where: { id },
    include: {
      faculty: { select: { id: true, name: true } },
      professors: { orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] },
    },
  });
  if (!department)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(department);
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
  if (!body.facultyId) {
    return NextResponse.json(
      { error: 'facultyId is required' },
      { status: 400 }
    );
  }

  try {
    const department = await prisma.department.update({
      where: { id },
      data: { name: body.name.trim(), facultyId: body.facultyId },
      include: { faculty: { select: { id: true, name: true } } },
    });
    return NextResponse.json(department);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025')
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.code === 'P2002')
        return NextResponse.json(
          { error: 'This department name already exists in that faculty' },
          { status: 409 }
        );
      if (error.code === 'P2003')
        return NextResponse.json(
          { error: 'Faculty not found' },
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
    await prisma.department.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025')
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.code === 'P2003')
        return NextResponse.json(
          { error: 'Cannot delete — department still has professors' },
          { status: 409 }
        );
    }
    throw error;
  }
}

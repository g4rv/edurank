import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { Prisma } from '@/generated/prisma/client';
import { NextResponse } from 'next/server';

export async function GET() {
  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: {
      faculty: { select: { id: true, name: true } },
      _count: { select: { professors: true } },
    },
  });
  return NextResponse.json(departments);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role === 'VIEWER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
    const department = await prisma.department.create({
      data: { name: body.name.trim(), facultyId: body.facultyId },
      include: { faculty: { select: { id: true, name: true } } },
    });
    return NextResponse.json(department, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json(
          { error: 'This department name already exists in that faculty' },
          { status: 409 }
        );
      }
      if (error.code === 'P2003') {
        return NextResponse.json(
          { error: 'Faculty not found' },
          { status: 400 }
        );
      }
    }
    throw error;
  }
}

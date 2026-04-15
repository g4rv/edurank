import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";

export async function GET() {
  const faculties = await prisma.faculty.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { departments: true } } },
  });
  return NextResponse.json(faculties);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const faculty = await prisma.faculty.create({
      data: { name: body.name.trim() },
    });
    return NextResponse.json(faculty, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A faculty with this name already exists" }, { status: 409 });
    }
    throw error;
  }
}

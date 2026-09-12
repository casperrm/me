import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const notes = await prisma.memoryNote.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.title || !body.content) {
    return NextResponse.json({ error: "Title and content are required." }, { status: 400 });
  }
  const note = await prisma.memoryNote.create({
    data: {
      userId: user.id,
      title: body.title,
      content: body.content,
      tags: body.tags || "",
      source: body.source || "manual",
      sourceUrl: body.sourceUrl || null,
    },
  });
  return NextResponse.json(note, { status: 201 });
}

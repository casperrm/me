import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.memoryNote.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

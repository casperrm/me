import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: any = {};
  if (body.description !== undefined) data.description = body.description;
  if (body.amount !== undefined) data.amount = Number(body.amount);
  if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);
  if (body.status !== undefined) {
    data.status = body.status;
    data.paidDate = body.status === "paid" ? new Date() : null;
  }
  const invoice = await prisma.invoice.update({ where: { id: params.id }, data });
  return NextResponse.json(invoice);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.invoice.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

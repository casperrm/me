import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: any = {};
  for (const key of ["name", "platform", "goal", "status"]) if (body[key] !== undefined) data[key] = body[key];
  for (const key of ["budget", "spend", "reach", "engagement", "conversions"]) if (body[key] !== undefined) data[key] = Number(body[key]);
  if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;

  const campaign = await prisma.campaign.update({ where: { id: params.id }, data });
  return NextResponse.json(campaign);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.campaign.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

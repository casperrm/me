import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { posts: true, campaigns: true, invoices: true } } },
  });
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const client = await prisma.client.create({
    data: {
      name: body.name,
      contact: body.contact || null,
      email: body.email || null,
      niche: body.niche || null,
      status: body.status || "active",
      notes: body.notes || null,
    },
  });
  return NextResponse.json(client, { status: 201 });
}

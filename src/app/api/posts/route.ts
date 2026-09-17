import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const posts = await prisma.post.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { date: "asc" },
    include: { client: true },
  });
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.clientId || !body.caption || !body.date) {
    return NextResponse.json({ error: "clientId, caption and date are required." }, { status: 400 });
  }
  const post = await prisma.post.create({
    data: {
      clientId: body.clientId,
      platform: body.platform || "instagram",
      caption: body.caption,
      notes: body.notes || null,
      date: new Date(body.date),
      status: body.status || "idea",
      aiGenerated: Boolean(body.aiGenerated),
    },
  });
  return NextResponse.json(post, { status: 201 });
}

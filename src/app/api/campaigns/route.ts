import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { startDate: "desc" },
    include: { client: true },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.clientId || !body.name || !body.startDate) {
    return NextResponse.json({ error: "clientId, name and startDate are required." }, { status: 400 });
  }
  const campaign = await prisma.campaign.create({
    data: {
      clientId: body.clientId,
      name: body.name,
      platform: body.platform || "instagram",
      goal: body.goal || null,
      budget: Number(body.budget) || 0,
      spend: Number(body.spend) || 0,
      reach: Number(body.reach) || 0,
      engagement: Number(body.engagement) || 0,
      conversions: Number(body.conversions) || 0,
      status: body.status || "planned",
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
    },
  });
  return NextResponse.json(campaign, { status: 201 });
}

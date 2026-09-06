import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { askBrain, isBrainConfigured } from "@/lib/anthropic";
import { recallMemories, formatMemoriesForPrompt } from "@/lib/memory";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId, product, platform, goal, audience } = await req.json();
  if (!product) return NextResponse.json({ error: "Describe the product/offer first." }, { status: 400 });

  if (!isBrainConfigured()) {
    return NextResponse.json({
      configured: false,
      result: "Add an ANTHROPIC_API_KEY to your .env file to turn on the ad creative assistant. See .env.example.",
    });
  }

  const client = clientId ? await prisma.client.findUnique({ where: { id: clientId } }) : null;
  const memories = await recallMemories(user.id, `${product} ${platform} ad design creative`);

  const system = `You are the Cedar Point Brain's creative director module. You help the agency move faster on ad design by producing copy and a clear creative brief - you cannot generate images yourself. Always structure your answer with these sections: "Headlines" (5 short options), "Primary text" (2-3 full variations), "CTA options" (3-5), and "Creative brief" (visual direction: layout, color mood, imagery/video direction, and one sentence on why it fits the brand). Be specific and usable, not generic.`;

  const userMessage = `Partner: ${client?.name || "unspecified"} ${client?.niche ? `(${client.niche})` : ""}
Platform: ${platform || "general social"}
Product/offer: ${product}
Goal: ${goal || "drive engagement/conversions"}
Audience: ${audience || "unspecified"}

Relevant agency memory:
${formatMemoriesForPrompt(memories)}`;

  const result = await askBrain({ system, messages: [{ role: "user", content: userMessage }], maxTokens: 1500 });

  return NextResponse.json({ configured: true, result });
}

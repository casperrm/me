import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { askBrain, isBrainConfigured } from "@/lib/anthropic";
import { recallMemories, formatMemoriesForPrompt } from "@/lib/memory";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await req.json();
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      posts: { orderBy: { date: "desc" }, take: 15 },
      campaigns: { orderBy: { startDate: "desc" }, take: 10 },
      invoices: { orderBy: { issueDate: "desc" }, take: 10 },
    },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  if (!isBrainConfigured()) {
    return NextResponse.json({
      configured: false,
      report: "Add an ANTHROPIC_API_KEY to your .env file to turn on AI-drafted client reports. See .env.example.",
    });
  }

  const memories = await recallMemories(user.id, `${client.name} report performance`);

  const postsSummary = client.posts.map((p) => `- ${p.date.toISOString().slice(0, 10)} (${p.platform}, ${p.status}): ${p.caption}`).join("\n") || "None.";
  const campaignSummary = client.campaigns
    .map((c) => `- ${c.name} (${c.platform}, ${c.status}): $${c.spend}/${c.budget} spent, ${c.reach} reach, ${c.engagement} engagement, ${c.conversions} conversions`)
    .join("\n") || "None.";
  const invoiceSummary = client.invoices.map((i) => `- ${i.description}: $${i.amount} (${i.status})`).join("\n") || "None.";

  const system = `You are the Cedar Point Brain, drafting a client-facing performance update on behalf of the agency account manager ("partner support"). Write warm but professional prose, organized with short headers, that the account manager can copy and send with light edits. Never invent numbers - only use what's given. If data is thin, say so briefly rather than padding.`;

  const userMessage = `Draft a performance update email for this partner.

Partner: ${client.name}
Niche: ${client.niche || "unspecified"}

Recent content:
${postsSummary}

Boost campaigns:
${campaignSummary}

Billing:
${invoiceSummary}

Relevant agency memory:
${formatMemoriesForPrompt(memories)}`;

  const report = await askBrain({ system, messages: [{ role: "user", content: userMessage }], maxTokens: 1500 });

  return NextResponse.json({ configured: true, report });
}

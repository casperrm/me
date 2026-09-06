import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { askBrain, isBrainConfigured } from "@/lib/anthropic";
import { recallMemories, formatMemoriesForPrompt } from "@/lib/memory";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId, platform, count = 5 } = await req.json();
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { posts: { orderBy: { date: "desc" }, take: 8 } },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  if (!isBrainConfigured()) {
    return NextResponse.json({
      configured: false,
      ideas: [],
      message:
        "Add an ANTHROPIC_API_KEY to your .env file to turn on AI-generated content ideas. See .env.example.",
    });
  }

  const memories = await recallMemories(user.id, `${client.name} ${client.niche ?? ""} content ideas`);
  const recentCaptions = client.posts.map((p) => `- (${p.platform}) ${p.caption}`).join("\n") || "None yet.";

  const system = `You are the Cedar Point Brain, the in-house AI strategist for a social media agency. You write in a punchy, practical, on-brand voice. When asked for content ideas, respond with ONLY a JSON array of strings (no markdown, no commentary), each string being one complete post idea including a suggested caption/hook.`;

  const userMessage = `Generate ${count} fresh ${platform} content ideas for this partner:

Business: ${client.name}
Niche: ${client.niche || "unspecified"}
Notes: ${client.notes || "none"}

Recently posted (avoid repeating):
${recentCaptions}

Relevant things we've learned before (agency memory):
${formatMemoriesForPrompt(memories)}

Respond with ONLY a JSON array of ${count} strings.`;

  const raw = await askBrain({ system, messages: [{ role: "user", content: userMessage }] });

  let ideas: string[] = [];
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    ideas = JSON.parse(match ? match[0] : raw);
    if (!Array.isArray(ideas)) throw new Error("not an array");
  } catch {
    ideas = raw
      .split("\n")
      .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean);
  }

  return NextResponse.json({ configured: true, ideas });
}

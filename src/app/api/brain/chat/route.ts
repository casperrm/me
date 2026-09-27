import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { askBrain, isBrainConfigured } from "@/lib/anthropic";
import { recallMemories, formatMemoriesForPrompt } from "@/lib/memory";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const messages = await prisma.chatMessage.findMany({
    where: { userId: user.id, mode: "chat" },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { message } = await req.json();
  if (!message || !message.trim()) return NextResponse.json({ error: "Message is required." }, { status: 400 });

  await prisma.chatMessage.create({ data: { userId: user.id, mode: "chat", role: "user", content: message } });

  if (!isBrainConfigured()) {
    const reply =
      "I'm not connected yet - add an ANTHROPIC_API_KEY to your .env file (see .env.example) and restart the server to activate the Cedar Point Brain.";
    await prisma.chatMessage.create({ data: { userId: user.id, mode: "chat", role: "assistant", content: reply } });
    return NextResponse.json({ reply, configured: false });
  }

  const history = await prisma.chatMessage.findMany({
    where: { userId: user.id, mode: "chat" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const ordered = history.reverse();

  const memories = await recallMemories(user.id, message);

  const system = `You are the Cedar Point Brain - the in-house AI teammate for Cedar Point, a social media agency. You help the owner run the business: writing client reports, brainstorming content, prioritizing work, and especially helping design and write ads faster (copy, headlines, creative direction - you can't generate images, but you can write detailed visual/creative briefs). You are direct, practical, and speak like an experienced agency strategist, not a generic chatbot.

You have a persistent memory of things the owner has taught you before. Use it when relevant, and don't repeat it back verbatim unless asked:
${formatMemoriesForPrompt(memories)}

If the owner shares a durable fact, preference, or lesson worth remembering, tell them you can save it (they have a "Save as memory" button for any of your replies).`;

  const reply = await askBrain({
    system,
    messages: ordered.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  });

  await prisma.chatMessage.create({ data: { userId: user.id, mode: "chat", role: "assistant", content: reply } });

  return NextResponse.json({ reply, configured: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { askBrain, isBrainConfigured } from "@/lib/anthropic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tasks = await prisma.task.findMany({
    where: { userId: user.id, status: "open" },
    include: { client: true },
  });

  if (tasks.length === 0) return NextResponse.json({ summary: "You have no open tasks.", reasons: {} });

  if (!isBrainConfigured()) {
    return NextResponse.json({
      configured: false,
      summary: "Add an ANTHROPIC_API_KEY to your .env file to turn on AI task prioritization. See .env.example.",
      reasons: {},
    });
  }

  const taskList = tasks
    .map((t) => `id:${t.id} | "${t.title}" | client:${t.client?.name ?? "none"} | priority:${t.priority} | due:${t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "no due date"}`)
    .join("\n");

  const system = `You are the Cedar Point Brain, an operations assistant for a small social media agency. You help the owner decide what to work on next. Respond with ONLY valid JSON: {"order": ["taskId1","taskId2",...], "reasons": {"taskId1": "one short reason", ...}, "summary": "one or two sentence overview of the day"}. Order tasks from most to least urgent, considering due dates, stated priority, and general agency judgment (client-facing deadlines usually beat internal admin).`;

  const raw = await askBrain({
    system,
    messages: [{ role: "user", content: `Here are my open tasks:\n${taskList}\n\nPrioritize them.` }],
  });

  let parsed: { order: string[]; reasons: Record<string, string>; summary: string };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : raw);
  } catch {
    return NextResponse.json({ configured: true, summary: raw, reasons: {} });
  }

  await Promise.all(
    parsed.order.map((id, i) => prisma.task.update({ where: { id }, data: { aiRank: i } }).catch(() => null))
  );

  return NextResponse.json({ configured: true, summary: parsed.summary, reasons: parsed.reasons || {} });
}

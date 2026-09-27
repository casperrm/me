import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { askBrain, isBrainConfigured } from "@/lib/anthropic";

const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];

function isPrivateHost(hostname: string) {
  if (BLOCKED_HOSTS.includes(hostname)) return true;
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  return false;
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await req.json();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "That's not a valid URL." }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsed.protocol) || isPrivateHost(parsed.hostname)) {
    return NextResponse.json({ error: "That URL isn't allowed." }, { status: 400 });
  }

  let text: string;
  try {
    const res = await fetch(parsed.toString(), { signal: AbortSignal.timeout(15000) });
    const raw = await res.text();
    text = htmlToText(raw).slice(0, 8000);
  } catch (err: any) {
    return NextResponse.json({ error: `Couldn't fetch that page: ${err?.message ?? "unknown error"}` }, { status: 400 });
  }

  if (!isBrainConfigured()) {
    return NextResponse.json({ error: "Add an ANTHROPIC_API_KEY to summarize and save pages. See .env.example." }, { status: 400 });
  }

  const summary = await askBrain({
    system:
      "You are the Cedar Point Brain's research module. You are given raw text scraped from a webpage about marketing, social media, design, or advertising. Extract the 3-6 most useful, concrete takeaways an agency could act on. Respond with ONLY valid JSON: {\"title\": \"short title for this learning\", \"summary\": \"the takeaways as a tight bulleted-style paragraph\"}.",
    messages: [{ role: "user", content: `URL: ${parsed.toString()}\n\nPage text:\n${text}` }],
  });

  let title = parsed.hostname;
  let content = summary;
  try {
    const match = summary.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(match ? match[0] : summary);
    title = obj.title || title;
    content = obj.summary || content;
  } catch {
    // fall back to raw summary text
  }

  const note = await prisma.memoryNote.create({
    data: {
      userId: user.id,
      title,
      content,
      tags: "trend,research",
      source: "link",
      sourceUrl: parsed.toString(),
    },
  });

  return NextResponse.json(note, { status: 201 });
}

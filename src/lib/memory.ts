import { prisma } from "@/lib/db";

// Lightweight keyword-based retrieval over stored memory notes - no vector DB
// needed for an agency-sized notebook of learnings. Scores notes by how many
// query words appear in their title/content/tags and returns the best matches.
export async function recallMemories(userId: string, query: string, limit = 6) {
  const notes = await prisma.memoryNote.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  if (notes.length === 0) return [];

  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) return notes.slice(0, limit);

  const scored = notes.map((note) => {
    const haystack = `${note.title} ${note.content} ${note.tags}`.toLowerCase();
    const score = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
    return { note, score };
  });

  scored.sort((a, b) => b.score - a.score || b.note.createdAt.getTime() - a.note.createdAt.getTime());

  const withHits = scored.filter((s) => s.score > 0).slice(0, limit);
  if (withHits.length > 0) return withHits.map((s) => s.note);

  // No keyword hits at all - fall back to most recent notes for general context.
  return notes.slice(0, Math.min(3, limit));
}

export function formatMemoriesForPrompt(notes: { title: string; content: string }[]) {
  if (notes.length === 0) return "No saved memories yet.";
  return notes.map((n, i) => `${i + 1}. ${n.title}: ${n.content}`).join("\n");
}

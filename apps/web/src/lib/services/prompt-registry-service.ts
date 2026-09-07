// Cedar Prompt Version Registry (Section 33) — see
// docs/specs/cedar-prompt-registry.md. Auto-captured, read-only.
import { prisma } from "@cedar/db";

// A version, once captured, is captured — no route or UI in this app
// writes CedarPromptSnapshot rows directly, and the module-level guard
// below means this only ever runs the upsert once per server process,
// not once per request.
const recordedThisProcess = new Set<string>();

/**
 * Idempotent: the first Cedar Brain request in this process for a given
 * `promptVersion` captures the real template text under that label;
 * every later call (this process or a future one, once the row exists)
 * is a no-op. If `template` differs from what's already stored under
 * this same version — someone changed the prompt without bumping
 * CEDAR_BRAIN_PROMPT_VERSION, violating cedar-brain.ts's own documented
 * convention — the stored row is updated to reflect the real current
 * text rather than silently keeping stale content under a live label.
 */
export async function ensurePromptSnapshotRecorded(promptVersion: string, template: string): Promise<void> {
  if (recordedThisProcess.has(promptVersion)) return;

  const existing = await prisma.cedarPromptSnapshot.findUnique({ where: { promptVersion } });
  if (!existing) {
    await prisma.cedarPromptSnapshot.create({ data: { promptVersion, template } });
  } else if (existing.template !== template) {
    await prisma.cedarPromptSnapshot.update({ where: { promptVersion }, data: { template } });
  }

  recordedThisProcess.add(promptVersion);
}

export async function getPromptSnapshots() {
  return prisma.cedarPromptSnapshot.findMany({ orderBy: { recordedAt: "desc" } });
}

/** Test-only: clears the in-process guard so a test can exercise the
 * real DB-upsert path more than once without waiting for a process
 * restart. Never called from application code. */
export function _resetPromptSnapshotGuardForTests(): void {
  recordedThisProcess.clear();
}

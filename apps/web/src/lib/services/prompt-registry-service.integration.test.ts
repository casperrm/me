// Integration test for prompt-registry-service.ts (Bible Section 33 —
// Cedar Prompt Version Registry). No server-only/next-headers mocks
// needed — this is a pure Prisma-writing service with no session/
// cookie dependency.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import {
  _resetPromptSnapshotGuardForTests,
  ensurePromptSnapshotRecorded,
  getPromptSnapshots,
} from "./prompt-registry-service";

const TEST_VERSION = "test-v-integration-only";

async function wipeTestSnapshots() {
  await prisma.cedarPromptSnapshot.deleteMany({ where: { promptVersion: { startsWith: "test-v-" } } });
}

beforeAll(async () => {
  await wipeTestSnapshots();
});

afterEach(() => {
  _resetPromptSnapshotGuardForTests();
});

afterAll(async () => {
  await wipeTestSnapshots();
  await prisma.$disconnect();
});

describe("ensurePromptSnapshotRecorded", () => {
  it("captures the real template text the first time a version is used", async () => {
    await ensurePromptSnapshotRecorded(TEST_VERSION, "You are a helpful agent.");
    const stored = await prisma.cedarPromptSnapshot.findUnique({ where: { promptVersion: TEST_VERSION } });
    expect(stored?.template).toBe("You are a helpful agent.");
  });

  it("does not overwrite with identical content — no-op when nothing changed", async () => {
    const before = await prisma.cedarPromptSnapshot.findUniqueOrThrow({ where: { promptVersion: TEST_VERSION } });
    await ensurePromptSnapshotRecorded(TEST_VERSION, "You are a helpful agent.");
    const after = await prisma.cedarPromptSnapshot.findUniqueOrThrow({ where: { promptVersion: TEST_VERSION } });
    expect(after.recordedAt.getTime()).toBe(before.recordedAt.getTime());
  });

  it("updates stored content when the same version's text actually drifted — a real convention violation, not silently ignored", async () => {
    await ensurePromptSnapshotRecorded(TEST_VERSION, "The prompt text changed without a version bump.");
    const stored = await prisma.cedarPromptSnapshot.findUniqueOrThrow({ where: { promptVersion: TEST_VERSION } });
    expect(stored.template).toBe("The prompt text changed without a version bump.");
  });

  it("is a true in-process no-op on repeat calls within the same process (no DB round-trip needed)", async () => {
    // Not directly observable from the test process, but exercising it
    // twice back-to-back with different content and confirming the
    // SECOND call's content did NOT get written (since the guard skips
    // it entirely) proves the guard actually short-circuits rather than
    // just happening to compute the same result.
    await ensurePromptSnapshotRecorded(TEST_VERSION, "captured once");
    await ensurePromptSnapshotRecorded(TEST_VERSION, "this must be ignored — guard already set");
    const stored = await prisma.cedarPromptSnapshot.findUniqueOrThrow({ where: { promptVersion: TEST_VERSION } });
    expect(stored.template).toBe("captured once");
  });
});

describe("getPromptSnapshots", () => {
  it("returns real rows, newest first", async () => {
    const olderVersion = "test-v-older";
    const newerVersion = "test-v-newer";
    await ensurePromptSnapshotRecorded(olderVersion, "older prompt");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await ensurePromptSnapshotRecorded(newerVersion, "newer prompt");

    const snapshots = await getPromptSnapshots();
    const olderIndex = snapshots.findIndex((s) => s.promptVersion === olderVersion);
    const newerIndex = snapshots.findIndex((s) => s.promptVersion === newerVersion);
    expect(newerIndex).toBeLessThan(olderIndex);

    await prisma.cedarPromptSnapshot.deleteMany({ where: { promptVersion: { in: [olderVersion, newerVersion] } } });
  });
});

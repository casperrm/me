// First-ever test coverage for packages/observability (confirmed via
// `find` before writing — this package had zero tests, matching a
// pattern this project has caught and fixed for other never-tested code
// this session). Proves the actual property that makes AsyncLocalStorage
// worth using over a plain module-level variable: the correlation ID
// survives through nested async calls and doesn't leak across
// concurrent, interleaved runs.
import { describe, expect, it, vi } from "vitest";
import { getCorrelationId, runWithCorrelationId } from "./correlation";
import { logger } from "./logger";

function lastLoggedLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const call = spy.mock.calls[spy.mock.calls.length - 1];
  return JSON.parse(call[0] as string);
}

describe("runWithCorrelationId / getCorrelationId", () => {
  it("returns undefined outside any correlation context", () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it("makes the id available for the duration of the callback", () => {
    const seen: (string | undefined)[] = [];
    runWithCorrelationId("job-1", () => {
      seen.push(getCorrelationId());
    });
    seen.push(getCorrelationId());
    expect(seen).toEqual(["job-1", undefined]);
  });

  it("propagates through nested async calls, not just the top frame", async () => {
    async function innerLayer() {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getCorrelationId();
    }
    async function middleLayer() {
      return innerLayer();
    }

    const seen = await runWithCorrelationId("deep-job", () => middleLayer());
    expect(seen).toBe("deep-job");
  });

  it("does not leak between two concurrent, interleaved runs", async () => {
    async function trackedRun(id: string, delayMs: number) {
      return runWithCorrelationId(id, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return getCorrelationId();
      });
    }

    const [a, b] = await Promise.all([trackedRun("run-a", 20), trackedRun("run-b", 5)]);
    expect(a).toBe("run-a");
    expect(b).toBe("run-b");
  });
});

describe("logger auto-tags log lines with the ambient correlation id", () => {
  it("omits correlationId entirely outside any correlation context", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("no context");
    const parsed = lastLoggedLine(spy);
    expect(parsed.correlationId).toBeUndefined();
    spy.mockRestore();
  });

  it("includes the real ambient correlation id inside a correlation context", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runWithCorrelationId("ambient-job-42", () => {
      logger.info("inside context");
    });
    const parsed = lastLoggedLine(spy);
    expect(parsed.correlationId).toBe("ambient-job-42");
    spy.mockRestore();
  });

  it("lets an explicit correlationId on the call override the ambient one", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runWithCorrelationId("ambient-job", () => {
      logger.info("explicit override", { correlationId: "explicit-override" });
    });
    const parsed = lastLoggedLine(spy);
    expect(parsed.correlationId).toBe("explicit-override");
    spy.mockRestore();
  });

  it("tags a log line from a nested async call several layers below the entry point", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    async function deepServiceCall() {
      await new Promise((resolve) => setTimeout(resolve, 5));
      logger.info("deep call site");
    }

    await runWithCorrelationId("job-with-nested-work", () => deepServiceCall());
    const parsed = lastLoggedLine(spy);
    expect(parsed.correlationId).toBe("job-with-nested-work");
    spy.mockRestore();
  });
});

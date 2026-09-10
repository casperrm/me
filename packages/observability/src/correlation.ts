// Bible Section 31.3: "Structured logs with correlation/request/workflow/
// agent IDs." The logger's LogContext already had a typed correlationId
// field, but nothing ever populated it — a real gap, not a hypothetical
// one (confirmed by grepping apps/* for actual usage before writing this:
// zero). This threads a real ID through an async call chain using Node's
// built-in AsyncLocalStorage, so every log line emitted anywhere during
// one bounded unit of work (a worker job run, eventually an API request)
// automatically carries the same ID without every call site needing to
// pass it explicitly — the only way to make "correlation" actually work
// across service functions several layers deep from the entry point.
import { AsyncLocalStorage } from "node:async_hooks";

const correlationStorage = new AsyncLocalStorage<string>();

/**
 * Runs `fn` with `correlationId` available to every `logger.*` call made
 * anywhere in its call graph (including through nested async functions,
 * which is the property a plain module-level variable can't provide once
 * concurrent calls interleave).
 */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return correlationStorage.run(correlationId, fn);
}

/** The current call chain's correlation ID, if one was established via runWithCorrelationId. */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}

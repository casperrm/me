// Minimal structured logger (Bible Section 31.3: "Structured logs with
// correlation/request/workflow/agent IDs"). Deliberately not a full
// logging framework (pino/winston) yet — see docs/adr/0010-deployment-and-observability.md
// for when that upgrade is warranted. JSON-per-line to stdout is enough
// for Phase 0 and composes with any log shipper later without a code change.
import { getCorrelationId } from "./correlation";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  organizationId?: string;
  userId?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, context: LogContext = {}) {
  // An explicit correlationId on this specific call always wins; absent
  // that, fall back to whatever runWithCorrelationId established for the
  // current async call chain (see correlation.ts) — this is what makes
  // every log line from one worker job run (or, later, one API request)
  // actually correlatable without threading an id through every function
  // signature by hand.
  const ambientCorrelationId = getCorrelationId();
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(ambientCorrelationId ? { correlationId: ambientCorrelationId } : {}),
    ...context,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => log("debug", message, context),
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext) => log("error", message, context),
};

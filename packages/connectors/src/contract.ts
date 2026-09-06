/**
 * Section 34's connector adapter contract, verbatim in shape:
 *   authorize(context) -> connection
 *   refresh(connection) -> connection
 *   health_check(connection) -> health
 *   sync(cursor, scope) -> normalized_changes + next_cursor
 *   handle_webhook(headers, payload) -> verified_events
 *   execute(command, idempotency_key) -> external_result
 *   reconcile(scope) -> drift_report
 *   revoke(connection) -> result
 *
 * `ConnectionRecord` below is provider-agnostic metadata (id, org, status,
 * scopes) — never the raw credential itself, which stays encrypted at
 * rest and is only ever decrypted inside an adapter method that needs it.
 * See docs/specs/integration-center.md for which methods the one real
 * adapter implemented so far (GenericWebhookAdapter) actually performs
 * versus legitimately not-applicable for a push-only integration.
 */
export interface ConnectionRecord {
  id: string;
  organizationId: string;
  provider: string;
  status: "CONNECTED" | "DISCONNECTED" | "DEGRADED" | "ERROR";
  scopes: string[];
}

export interface AuthorizeContext {
  organizationId: string;
  name: string;
}

export interface ConnectionHealth {
  status: "CONNECTED" | "DISCONNECTED" | "DEGRADED" | "ERROR";
  detail: string;
  lastCheckedAt: Date;
}

export interface NormalizedChange {
  externalId: string;
  type: string;
  data: Record<string, unknown>;
}

export interface SyncResult {
  changes: NormalizedChange[];
  nextCursor: string | null;
}

export interface VerifiedEvent {
  idempotencyKey: string;
  eventType: string | null;
  payload: Record<string, unknown>;
}

export interface ExternalResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

export interface DriftReport {
  scope: string;
  drifted: boolean;
  detail: string;
}

export interface ConnectorAdapter<TConnection = ConnectionRecord> {
  authorize(context: AuthorizeContext): Promise<TConnection>;
  refresh(connection: TConnection): Promise<TConnection>;
  healthCheck(connection: TConnection): Promise<ConnectionHealth>;
  sync(connection: TConnection, cursor: string | null): Promise<SyncResult>;
  handleWebhook(connection: TConnection, headers: Record<string, string>, rawBody: string): Promise<VerifiedEvent[]>;
  execute(connection: TConnection, command: string, idempotencyKey: string): Promise<ExternalResult>;
  reconcile(connection: TConnection, scope: string): Promise<DriftReport>;
  revoke(connection: TConnection): Promise<{ ok: boolean }>;
}

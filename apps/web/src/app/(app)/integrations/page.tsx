import { Card } from "@/components/Card";
import { checkPermission } from "@/lib/guards";
import { PermissionDenied } from "@/components/PermissionDenied";
import { listConnections } from "@/lib/services/connection-service";
import { CreateConnectionForm } from "./CreateConnectionForm";
import { RevokeConnectionButton } from "./RevokeConnectionButton";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  CONNECTED: "text-green-700 bg-green-50",
  DEGRADED: "text-amber-700 bg-amber-50",
  DISCONNECTED: "text-neutral-500 bg-neutral-100",
  ERROR: "text-red-700 bg-red-50",
};

export default async function IntegrationsPage() {
  // Connection dashboard (Section 17.1) — a connection's signing secret is
  // sensitive org infrastructure, gated the same way inviting a member is.
  const { allowed, actor } = await checkPermission("organization:manage");
  if (!allowed || !actor) {
    return <PermissionDenied message="Integration Center requires the organization:manage permission. Ask an admin or owner." />;
  }

  const connections = await listConnections(actor.organizationId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integration Center</h1>
        <p className="text-sm text-neutral-500">
          Connections to external tools (Section 17). Today this supports one real provider — a signed generic
          webhook receiver for tools like Zapier or Make. Meta, TikTok, Google, and WhatsApp adapters need real
          OAuth app registrations this environment doesn&apos;t have — see docs/specs/integration-center.md.
        </p>
      </div>

      <Card title="Connections" action={<CreateConnectionForm />}>
        {connections.length === 0 ? (
          <p className="text-sm text-neutral-400">No connections yet.</p>
        ) : (
          <ul className="space-y-3">
            {connections.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 border-b border-neutral-50 pb-3 last:border-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {c.provider} · {c.eventCount} event(s) · {c.healthDetail}
                  </div>
                </div>
                {c.status !== "DISCONNECTED" && <RevokeConnectionButton connectionId={c.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

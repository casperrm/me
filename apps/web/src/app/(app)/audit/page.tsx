import Link from "next/link";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { checkPermission } from "@/lib/guards";
import { listAuditEvents } from "@/lib/services/audit-log-service";

export const dynamic = "force-dynamic";

const RESULT_STYLE: Record<string, string> = {
  SUCCESS: "bg-cedar-100 text-cedar-800",
  FAILURE: "bg-red-100 text-red-800",
  DENIED: "bg-amber-100 text-amber-800",
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; resourceType?: string }>;
}) {
  // Section 23.2's Audit Event Minimum Schema has been fully populated by
  // every write path in this app since Phase 0 — this is the first thing
  // that reads it back. audit:read has been a real permission in the
  // catalog this whole time (ADMIN/OWNER hold it org-wide by default)
  // with no page checking it until now.
  const { allowed, actor } = await checkPermission("audit:read");
  if (!allowed || !actor) {
    return <PermissionDenied message="The Audit Log requires audit:read. Ask an owner or admin." />;
  }

  const { page: pageParam, resourceType } = await searchParams;
  const { entries, totalCount, totalPages, page } = await listAuditEvents({
    actorUserId: actor.user.id,
    organizationId: actor.organizationId,
    page: Number(pageParam) || 1,
    resourceType: resourceType || undefined,
  });

  // Not the shared Pagination component — that assumes a bare basePath
  // with only a `page` query param, which would silently drop this
  // page's resourceType filter when navigating between pages.
  function pageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (resourceType) params.set("resourceType", resourceType);
    params.set("page", String(targetPage));
    return `/audit?${params.toString()}`;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-sm text-neutral-500">
          Every recorded write in this organization — actor, action, resource, and result (Section 23.2). Append-only;
          nothing here can be edited or deleted.
        </p>
      </div>

      {resourceType && (
        <div className="text-xs text-neutral-500">
          Filtered to <span className="font-medium text-neutral-700">{resourceType}</span> —{" "}
          <Link href="/audit" className="text-cedar-700 hover:underline">
            clear filter
          </Link>
        </div>
      )}

      <Card>
        {entries.length === 0 ? (
          <p className="text-sm text-neutral-400">No audit events recorded yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {entries.map((entry) => (
              <li key={entry.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_STYLE[entry.result] ?? "bg-neutral-100 text-neutral-600"}`}
                  >
                    {entry.result}
                  </span>
                  <span className="font-medium text-neutral-800">{entry.action}</span>
                  <Link
                    href={`/audit?resourceType=${encodeURIComponent(entry.resourceType)}`}
                    className="text-xs text-neutral-400 hover:text-cedar-700 hover:underline"
                  >
                    {entry.resourceType}
                  </Link>
                  <span className="text-xs text-neutral-300">#{entry.resourceId.slice(0, 8)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                  <span>{entry.actorLabel}</span>
                  {entry.clientName && (
                    <Link href={`/clients/${entry.clientId}`} className="text-cedar-700 hover:underline">
                      {entry.clientName}
                    </Link>
                  )}
                  {entry.approvalId && <span>Approval #{entry.approvalId.slice(0, 8)}</span>}
                  <span>{entry.timestamp.toLocaleString()}</span>
                </div>
                {entry.changeSet && (
                  <details className="mt-1 text-xs text-neutral-400">
                    <summary className="cursor-pointer">Change set</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-neutral-50 p-2 text-neutral-600">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(entry.changeSet!), null, 2);
                        } catch {
                          return entry.changeSet;
                        }
                      })()}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-xs text-neutral-500">
            <span>
              Page {page} of {totalPages} ({totalCount} total)
            </span>
            <div className="flex gap-3">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="text-cedar-700 hover:underline">
                  ← Newer
                </Link>
              ) : (
                <span className="text-neutral-300">← Newer</span>
              )}
              {page < totalPages ? (
                <Link href={pageHref(page + 1)} className="text-cedar-700 hover:underline">
                  Older →
                </Link>
              ) : (
                <span className="text-neutral-300">Older →</span>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

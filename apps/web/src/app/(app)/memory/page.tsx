import Link from "next/link";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { checkPermission } from "@/lib/guards";
import { listAgencyMemoryEntries } from "@/lib/services/agency-memory-service";

export const dynamic = "force-dynamic";

export default async function AgencyMemoryPage() {
  // Same org-wide clients:write gate as /templates — Agency Memory is the
  // other shared, curated resource in this codebase (Section 19.2/6.6).
  const { allowed, actor } = await checkPermission("clients:write");
  if (!allowed || !actor) {
    return <PermissionDenied message="Agency Memory requires clients:write organization-wide. Ask an owner or admin." />;
  }

  const entries = await listAgencyMemoryEntries({ actorUserId: actor.user.id, organizationId: actor.organizationId });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Agency Memory</h1>
        <p className="text-sm text-neutral-500">
          Institutional knowledge explicitly promoted from meeting decisions (Section 19.2/6.6) — never written
          automatically. Promote a decision from a meeting&apos;s Decisions card. There is no reset/override control
          here because nothing is learned or cached: this list is exactly what has been explicitly curated, read
          fresh every time.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-400">
            Nothing promoted yet. Open a meeting with a recorded decision and click &quot;Promote to Agency
            Memory.&quot;
          </p>
        </Card>
      ) : (
        entries.map((entry) => (
          <Card key={entry.id}>
            <p className="text-sm text-neutral-800">{entry.content}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
              {entry.clientName && <span>{entry.clientName}</span>}
              <span>Promoted by {entry.promotedByName}</span>
              <span>{entry.promotedAt.toLocaleString()}</span>
              <Link href={`/meetings/${entry.sourceMeetingId}`} className="text-cedar-700 hover:underline">
                Source meeting →
              </Link>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

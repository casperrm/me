import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { NewContentItemForm } from "./NewContentItemForm";
import { ContentItemStatusForm } from "./ContentItemStatusForm";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  BRIEF: "bg-neutral-100 text-neutral-600",
  DRAFT: "bg-neutral-100 text-neutral-600",
  INTERNAL_REVIEW: "bg-amber-50 text-amber-700",
  CLIENT_APPROVAL: "bg-amber-50 text-amber-700",
  SCHEDULED: "bg-cedar-50 text-cedar-700",
  PUBLISHED: "bg-cedar-100 text-cedar-800",
  FAILED: "bg-red-50 text-red-700",
};

export default async function ContentCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();

  const client = await prisma.client.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!client) notFound();

  const allowed = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:read",
    clientId: client.id,
  });
  if (!allowed) return <PermissionDenied message="You don't have access to this client's content plan." />;

  const canWrite = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:write",
    clientId: client.id,
  });

  const [items, campaigns, creatives, members] = await Promise.all([
    prisma.contentCalendarItem.findMany({
      where: { clientId: client.id },
      include: { campaign: true, creative: true, owner: { include: { user: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.campaign.findMany({ where: { project: { clientId: client.id } }, select: { id: true, name: true } }),
    prisma.creative.findMany({
      where: { campaign: { project: { clientId: client.id } } },
      select: { id: true, type: true, platform: true, campaign: { select: { name: true } } },
    }),
    canWrite
      ? prisma.membership.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE" }, include: { user: true } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${client.id}`} className="text-xs text-cedar-700 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Content Calendar</h1>
        <p className="text-sm text-neutral-500">
          Planning and scheduling for {client.name} across channels (Bible Section 9).
        </p>
      </div>

      <Card
        action={
          canWrite && (
            <NewContentItemForm
              clientId={client.id}
              campaigns={campaigns.map((c) => ({ id: c.id, label: c.name }))}
              creatives={creatives.map((c) => ({ id: c.id, label: `${c.campaign.name} — ${c.type}${c.platform ? ` (${c.platform})` : ""}` }))}
              members={members.map((m) => ({ id: m.id, label: m.user.name }))}
            />
          )
        }
      >
        {items.length === 0 ? (
          <p className="text-sm text-neutral-400">Nothing planned yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-xs text-neutral-500">
                  <th className="pb-2 pr-4">Title</th>
                  <th className="pb-2 pr-4">Channel</th>
                  <th className="pb-2 pr-4">Pillar / Format</th>
                  <th className="pb-2 pr-4">Owner</th>
                  <th className="pb-2 pr-4">Due</th>
                  <th className="pb-2 pr-4">Publish</th>
                  <th className="pb-2 pr-4">Status</th>
                  {canWrite && <th className="pb-2">Move</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-neutral-50">
                    <td className="py-2 pr-4">
                      {item.title}
                      {item.campaign && <div className="text-xs text-neutral-400">{item.campaign.name}</div>}
                      {item.status === "FAILED" && item.failureReason && (
                        <div className="text-xs text-red-600">{item.failureReason}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4">{item.channel}</td>
                    <td className="py-2 pr-4 text-xs text-neutral-500">
                      {[item.contentPillar, item.format].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs text-neutral-500">{item.owner?.user.name ?? "—"}</td>
                    <td className="py-2 pr-4 text-xs text-neutral-500">{item.dueDate ? item.dueDate.toLocaleDateString() : "—"}</td>
                    <td className="py-2 pr-4 text-xs text-neutral-500">{item.publishAt ? item.publishAt.toLocaleDateString() : "—"}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[item.status] ?? ""}`}>{item.status}</span>
                    </td>
                    {canWrite && (
                      <td className="py-2">
                        <ContentItemStatusForm itemId={item.id} status={item.status} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

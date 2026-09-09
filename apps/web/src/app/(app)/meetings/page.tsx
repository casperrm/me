import Link from "next/link";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { requireActor } from "@/lib/guards";
import { getReadableClientIds, getWritableClientIds } from "@/lib/readable-clients";
import { listMeetingsForOrganization } from "@/lib/services/meeting-service";
import { NewMeetingForm } from "./NewMeetingForm";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const actor = await requireActor();

  const readableClientIds = await getReadableClientIds(actor);
  const meetings = await listMeetingsForOrganization({
    organizationId: actor.organizationId,
    clientIds: readableClientIds,
  });

  const writableClientIds = await getWritableClientIds(actor);
  const canCreateInternal = writableClientIds === undefined;
  const writableClients = await prisma.client.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(writableClientIds ? { id: { in: writableClientIds } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const members = await prisma.membership.findMany({
    where: { organizationId: actor.organizationId, status: "ACTIVE" },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Meetings</h1>
        <p className="text-sm text-neutral-500">
          Section 13&apos;s record-keeping half: participants, notes, decisions, and follow-ups a human enters — no
          transcript capture or AI-generated summary (see docs/specs/meetings.md).
        </p>
      </div>

      <Card>
        {meetings.length === 0 ? (
          <p className="mb-3 text-sm text-neutral-400">No meetings logged yet.</p>
        ) : (
          <ul className="mb-3 divide-y divide-neutral-100">
            {meetings.map((m) => (
              <li key={m.id} className="py-2 text-sm">
                <Link href={`/meetings/${m.id}`} className="flex flex-wrap items-center justify-between gap-2 hover:text-cedar-700">
                  <span className="font-medium">{m.title}</span>
                  <span className="flex items-center gap-3 text-xs text-neutral-500">
                    <span className="rounded-full bg-cedar-50 px-2 py-0.5 text-cedar-700">
                      {m.client?.name ?? "Internal"}
                    </span>
                    <span>{m.occurredAt.toLocaleDateString()}</span>
                    <span>
                      {m.attendees.length} attendee{m.attendees.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <NewMeetingForm
          clients={writableClients}
          canCreateInternal={canCreateInternal}
          members={members.map((m) => ({ id: m.id, name: m.user.name }))}
        />
      </Card>
    </div>
  );
}

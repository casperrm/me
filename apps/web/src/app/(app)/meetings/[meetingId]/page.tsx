import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { getWritableClientIds } from "@/lib/readable-clients";
import { MeetingNotesForm } from "./MeetingNotesForm";
import { MeetingDecisions } from "./MeetingDecisions";
import { MeetingFollowUps } from "./MeetingFollowUps";

export const dynamic = "force-dynamic";

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

interface Decision {
  id: string;
  text: string;
  rationale: string | null;
  createdAt: string;
  promotedToMemoryId: string | null;
}
interface FollowUp {
  id: string;
  text: string;
  ownerMembershipId: string | null;
  dueDate: string | null;
  promotedTaskId: string | null;
}

export default async function MeetingDetailPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const actor = await requireActor();

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, organizationId: actor.organizationId },
    include: {
      client: true,
      attendees: { include: { membership: { include: { user: true } } } },
    },
  });
  if (!meeting) notFound();

  const allowed = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:read",
    clientId: meeting.clientId ?? undefined,
  });
  if (!allowed) return <PermissionDenied message="You don't have access to this meeting." />;

  const canWrite = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:write",
    clientId: meeting.clientId ?? undefined,
  });

  const decisions = parseJSON<Decision[]>(meeting.decisions, []);
  const followUps = parseJSON<FollowUp[]>(meeting.followUps, []);

  const members = await prisma.membership.findMany({
    where: { organizationId: actor.organizationId, status: "ACTIVE" },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });

  // Promote-to-task project scope: this meeting's own client's projects
  // when client-scoped; every project the actor can write to (mirroring
  // `promoteFollowUpToTask`'s own server-side rule) when internal.
  let projects: { id: string; name: string }[] = [];
  if (meeting.clientId) {
    if (canWrite) {
      projects = await prisma.project.findMany({
        where: { clientId: meeting.clientId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    }
  } else {
    const writableClientIds = await getWritableClientIds(actor);
    if (writableClientIds === undefined) {
      projects = await prisma.project.findMany({
        where: { client: { organizationId: actor.organizationId } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    } else if (writableClientIds.length > 0) {
      projects = await prisma.project.findMany({
        where: { clientId: { in: writableClientIds } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    }
  }

  const promotedTaskIds = followUps.map((f) => f.promotedTaskId).filter((id): id is string => Boolean(id));
  const taskLinks: Record<string, { href: string; title: string }> = {};
  if (promotedTaskIds.length > 0) {
    const tasks = await prisma.task.findMany({
      where: { id: { in: promotedTaskIds } },
      include: { project: { include: { client: true } } },
    });
    for (const t of tasks) {
      taskLinks[t.id] = { href: `/clients/${t.project.clientId}/projects/${t.projectId}`, title: t.title };
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/meetings" className="text-xs text-neutral-400 hover:text-cedar-700">
          ← All meetings
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{meeting.title}</h1>
        <p className="text-sm text-neutral-500">
          {meeting.client ? (
            <>
              <Link href={`/clients/${meeting.client.id}`} className="text-cedar-700 hover:underline">
                {meeting.client.name}
              </Link>{" "}
              · {meeting.occurredAt.toLocaleDateString()}
            </>
          ) : (
            <>Internal meeting · {meeting.occurredAt.toLocaleDateString()}</>
          )}
        </p>
        <p className="mt-1 text-xs text-neutral-400">Last updated {meeting.updatedAt.toLocaleString()}</p>
      </div>

      <Card title="Attendees">
        {meeting.attendees.length === 0 ? (
          <p className="text-sm text-neutral-400">No attendees recorded.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {meeting.attendees.map((a) => (
              <span key={a.id} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                {a.membership.user.name}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card title="Notes">
        {canWrite ? (
          <MeetingNotesForm meetingId={meeting.id} notes={meeting.notes} />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-neutral-700">{meeting.notes || "No notes yet."}</p>
        )}
      </Card>

      <Card title="Decisions">
        {canWrite ? (
          <MeetingDecisions meetingId={meeting.id} decisions={decisions} />
        ) : decisions.length === 0 ? (
          <p className="text-sm text-neutral-400">No decisions recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {decisions.map((d) => (
              <li key={d.id} className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-neutral-800">{d.text}</div>
                  {d.promotedToMemoryId && <span className="shrink-0 text-xs text-cedar-700">In Agency Memory</span>}
                </div>
                {d.rationale && <div className="mt-0.5 text-xs text-neutral-500">Rationale: {d.rationale}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Follow-ups">
        {canWrite ? (
          <MeetingFollowUps
            meetingId={meeting.id}
            followUps={followUps}
            members={members.map((m) => ({ id: m.id, name: m.user.name }))}
            projects={projects}
            taskLinks={taskLinks}
          />
        ) : followUps.length === 0 ? (
          <p className="text-sm text-neutral-400">No follow-ups recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {followUps.map((f) => (
              <li key={f.id} className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm">
                <div className="font-medium text-neutral-800">{f.text}</div>
                {f.promotedTaskId && taskLinks[f.promotedTaskId] && (
                  <Link href={taskLinks[f.promotedTaskId].href} className="text-xs text-cedar-700 hover:underline">
                    ✓ Task created — {taskLinks[f.promotedTaskId].title}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

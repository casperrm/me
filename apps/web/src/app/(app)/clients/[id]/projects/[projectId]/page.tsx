import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { NewTaskForm } from "./NewTaskForm";
import { TaskStatusForm } from "./TaskStatusForm";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { todo: "To do", in_progress: "In progress", done: "Done" };

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string; projectId: string }> }) {
  const { id, projectId } = await params;
  const actor = await requireActor();

  const project = await prisma.project.findFirst({
    where: { id: projectId, clientId: id, client: { organizationId: actor.organizationId } },
    include: {
      client: true,
      tasks: { include: { assignee: { include: { user: true } } }, orderBy: { createdAt: "asc" } },
      campaigns: true,
    },
  });
  if (!project) notFound();

  const allowed = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:read",
    clientId: project.clientId,
  });
  if (!allowed) return <PermissionDenied message="You don't have access to this project." />;

  const canWrite = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:write",
    clientId: project.clientId,
  });

  const members = canWrite
    ? await prisma.membership.findMany({
        where: { organizationId: actor.organizationId, status: "ACTIVE" },
        include: { user: true },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${project.clientId}`} className="text-xs text-cedar-700 hover:underline">
          ← {project.client.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-neutral-500">
          {project.status} {project.dueDate && `· due ${project.dueDate.toLocaleDateString()}`}
        </p>
      </div>

      <Card title="Tasks">
        {project.tasks.length === 0 ? (
          <p className="mb-4 text-sm text-neutral-400">No tasks yet.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {project.tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between border-b border-neutral-50 pb-2 text-sm">
                <div>
                  <span className={task.status === "done" ? "text-neutral-400 line-through" : ""}>{task.title}</span>
                  {task.assignee && <span className="ml-2 text-xs text-neutral-400">— {task.assignee.user.name}</span>}
                  {task.dueDate && <span className="ml-2 text-xs text-neutral-400">due {task.dueDate.toLocaleDateString()}</span>}
                </div>
                {canWrite ? (
                  <TaskStatusForm taskId={task.id} clientId={project.clientId} projectId={project.id} status={task.status} />
                ) : (
                  <span className="text-xs text-neutral-500">{STATUS_LABEL[task.status] ?? task.status}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <NewTaskForm
            projectId={project.id}
            members={members.map((m) => ({ id: m.id, name: m.user.name }))}
          />
        )}
      </Card>

      <Card title="Campaigns">
        {project.campaigns.length === 0 ? (
          <p className="text-sm text-neutral-400">No campaigns yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {project.campaigns.map((c) => (
              <li key={c.id} className="flex justify-between">
                <span>{c.name}</span>
                <span className="text-xs text-neutral-500">{c.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

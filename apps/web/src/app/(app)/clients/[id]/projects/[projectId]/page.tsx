import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { getProjectProfitability } from "@/lib/services/profitability-service";
import { NewTaskForm } from "./NewTaskForm";
import { TaskStatusForm } from "./TaskStatusForm";
import { NewCampaignForm } from "./NewCampaignForm";

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

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

  const canReadFinance = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "finance:read",
  });
  // Computed from all of the client's invoices/expenses, then this one
  // project's row is picked out — cheaper to call getProjectProfitability
  // (which already scopes to the client) than to write a project-specific
  // query, and it stays consistent with how the client-level table reads.
  const projectProfitability = canReadFinance
    ? (await getProjectProfitability(project.clientId)).projects.find((p) => p.projectId === project.id)
    : null;

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

      {canReadFinance && (
        <Card title="Profitability">
          {projectProfitability ? (
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-neutral-500">Revenue</dt>
                <dd className="text-lg font-semibold">{money(projectProfitability.revenueCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Cost</dt>
                <dd className="text-lg font-semibold">{money(projectProfitability.costCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Profit</dt>
                <dd className={`text-lg font-semibold ${projectProfitability.profitCents < 0 ? "text-red-600" : ""}`}>
                  {money(projectProfitability.profitCents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Margin</dt>
                <dd className="text-lg font-semibold">
                  {projectProfitability.marginPct === null ? "—" : `${projectProfitability.marginPct.toFixed(0)}%`}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-neutral-400">
              No revenue or cost has been tagged to this project yet — create an invoice or expense on the client
              page and assign it to this project.
            </p>
          )}
        </Card>
      )}

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

      <Card title="Campaigns" action={canWrite && <NewCampaignForm projectId={project.id} />}>
        {project.campaigns.length === 0 ? (
          <p className="text-sm text-neutral-400">No campaigns yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {project.campaigns.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/clients/${project.clientId}/projects/${project.id}/campaigns/${c.id}`}
                  className="flex justify-between hover:text-cedar-700"
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-neutral-500">{c.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

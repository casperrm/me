import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { buildSignedDownloadPath } from "@/lib/storage";
import { getProjectProfitability } from "@/lib/services/profitability-service";
import { NewTaskForm } from "./NewTaskForm";
import { TaskStatusForm } from "./TaskStatusForm";
import { TaskPriorityForm } from "./TaskPriorityForm";
import { TaskEstimateForm } from "./TaskEstimateForm";
import { TaskChecklist } from "./TaskChecklist";
import { TaskComments } from "./TaskComments";
import { TaskAttachments } from "./TaskAttachments";
import { TaskDependencies } from "./TaskDependencies";
import { Milestones } from "./Milestones";
import { NewCampaignForm } from "./NewCampaignForm";

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { todo: "To do", in_progress: "In progress", done: "Done" };
const PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string; projectId: string }> }) {
  const { id, projectId } = await params;
  const actor = await requireActor();

  const project = await prisma.project.findFirst({
    where: { id: projectId, clientId: id, client: { organizationId: actor.organizationId } },
    include: {
      client: true,
      tasks: {
        include: {
          assignee: { include: { user: true } },
          checklistItems: { orderBy: { position: "asc" } },
          comments: { include: { author: { include: { user: true } } }, orderBy: { createdAt: "asc" } },
          attachments: { include: { uploadedBy: { include: { user: true } } }, orderBy: { createdAt: "asc" } },
          blockedBy: { include: { blockedByTask: true }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      },
      campaigns: true,
      milestones: { orderBy: { dueDate: "asc" } },
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

      <Card title="Milestones">
        <Milestones
          projectId={project.id}
          canWrite={canWrite}
          milestones={project.milestones.map((m) => ({
            id: m.id,
            name: m.name,
            dueDate: m.dueDate.toISOString(),
            done: m.done,
            overdue: !m.done && m.dueDate.getTime() < Date.now(),
          }))}
        />
      </Card>

      <Card title="Tasks">
        {project.tasks.length === 0 ? (
          <p className="mb-4 text-sm text-neutral-400">No tasks yet.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {project.tasks.map((task) => (
              <li key={task.id} className="border-b border-neutral-50 pb-2 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className={task.status === "done" ? "text-neutral-400 line-through" : ""}>{task.title}</span>
                    {task.assignee && <span className="ml-2 text-xs text-neutral-400">— {task.assignee.user.name}</span>}
                    {task.dueDate && <span className="ml-2 text-xs text-neutral-400">due {task.dueDate.toLocaleDateString()}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {canWrite ? (
                      <>
                        <TaskEstimateForm taskId={task.id} clientId={project.clientId} projectId={project.id} estimateHours={task.estimateHours} />
                        <TaskPriorityForm taskId={task.id} clientId={project.clientId} projectId={project.id} priority={task.priority} />
                        <TaskStatusForm
                          taskId={task.id}
                          clientId={project.clientId}
                          projectId={project.id}
                          status={task.status}
                          openBlockerTitles={task.blockedBy.filter((dep) => dep.blockedByTask.status !== "done").map((dep) => dep.blockedByTask.title)}
                        />
                      </>
                    ) : (
                      <>
                        {task.estimateHours !== null && <span className="text-xs text-neutral-500">{task.estimateHours}h</span>}
                        <span className="text-xs text-neutral-500">{PRIORITY_LABEL[task.priority] ?? task.priority}</span>
                        <span className="text-xs text-neutral-500">{STATUS_LABEL[task.status] ?? task.status}</span>
                      </>
                    )}
                  </div>
                </div>
                <TaskDependencies
                  taskId={task.id}
                  dependencies={task.blockedBy.map((dep) => ({
                    id: dep.id,
                    blockedByTaskId: dep.blockedByTaskId,
                    blockedByTaskTitle: dep.blockedByTask.title,
                    blockedByTaskDone: dep.blockedByTask.status === "done",
                  }))}
                  taskOptions={project.tasks
                    .filter((t) => t.id !== task.id && !task.blockedBy.some((dep) => dep.blockedByTaskId === t.id))
                    .map((t) => ({ id: t.id, title: t.title }))}
                  canWrite={canWrite}
                />
                <TaskChecklist taskId={task.id} items={task.checklistItems} canWrite={canWrite} />
                <TaskComments taskId={task.id} comments={task.comments} canWrite={canWrite} />
                <TaskAttachments
                  taskId={task.id}
                  canWrite={canWrite}
                  attachments={task.attachments.map((a) => ({
                    id: a.id,
                    filename: a.filename,
                    sizeBytes: a.sizeBytes,
                    downloadUrl: buildSignedDownloadPath(a.id),
                    uploadedByName: a.uploadedBy?.user.name ?? null,
                  }))}
                />
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

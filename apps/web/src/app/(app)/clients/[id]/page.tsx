import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { NewProjectForm } from "./NewProjectForm";
import { NewProjectFromTemplateForm } from "./NewProjectFromTemplateForm";
import { AssetUploadForm } from "./AssetUploadForm";
import { AssetsList } from "./AssetsList";
import { AddExpenseForm } from "./AddExpenseForm";
import { AddInvoiceForm } from "./AddInvoiceForm";
import { InvoiceActions } from "./InvoiceActions";
import { AddNoteForm } from "./AddNoteForm";
import { buildSignedDownloadPath } from "@/lib/storage";
import { getOpportunitiesForClient } from "@/lib/services/opportunity-service";
import { getClientRenewalRecommendation } from "@/lib/services/decision-engine-service";
import { getRecentCedarBrainActivityForClient } from "@/lib/services/context-retrieval-service";
import { getTemplateUsageCounts, listProjectTemplates } from "@/lib/services/project-template-service";
import { listMeetingsForClient } from "@/lib/services/meeting-service";
import { NewMeetingForm } from "../../meetings/NewMeetingForm";

export const dynamic = "force-dynamic";

// How many of each relation to preview here — the rest lives behind a
// "View all" link to a dedicated paginated page (see
// docs/specs/client-relations-pagination.md). Keeps this overview page's
// query bounded regardless of how much history a client accumulates.
const PREVIEW_LIMIT = 10;

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export default async function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();

  // Org-scope the lookup itself — a client ID from a different
  // organization must 404, not merely fail a later permission check
  // (Bible Section 38: cross-client/cross-tenant access must fail even if
  // identifiers are guessed or manipulated).
  const client = await prisma.client.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: {
      brandProfile: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
      projects: {
        orderBy: { createdAt: "desc" },
        take: PREVIEW_LIMIT,
        include: { _count: { select: { campaigns: true, tasks: true } } },
      },
      invoices: { orderBy: { issuedAt: "desc" }, take: PREVIEW_LIMIT },
      expenses: { orderBy: { incurredAt: "desc" }, take: PREVIEW_LIMIT },
      notes: { orderBy: { createdAt: "desc" }, take: PREVIEW_LIMIT },
      timelineEvents: { orderBy: { occurredAt: "desc" }, take: PREVIEW_LIMIT },
      healthScores: { orderBy: { computedAt: "desc" }, take: 1 },
      assets: { orderBy: { createdAt: "desc" }, take: PREVIEW_LIMIT, include: { uploadedBy: { include: { user: true } } } },
      _count: { select: { projects: true, invoices: true, expenses: true, notes: true, timelineEvents: true, assets: true } },
    },
  });

  if (!client) notFound();

  const allowed = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:read",
    clientId: client.id,
  });
  if (!allowed) return <PermissionDenied message="You don't have access to this client." />;

  const canWrite = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:write",
    clientId: client.id,
  });

  const canWriteFinance = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "finance:write",
  });

  const [projectTemplates, templateUsageCounts] = canWrite
    ? await Promise.all([
        listProjectTemplates({ actorUserId: actor.user.id, organizationId: actor.organizationId, clientId: client.id }),
        getTemplateUsageCounts(actor.organizationId),
      ])
    : [[], new Map<string, number>()] as const;

  const brandVersion = client.brandProfile?.versions[0];
  const services = parseJSON<string[]>(client.services, []);
  const colors = parseJSON<{ name: string; hex: string }[]>(brandVersion?.colors, []);
  const fonts = parseJSON<{ role: string; family: string }[]>(brandVersion?.fonts, []);
  const products = parseJSON<string[]>(brandVersion?.products, []);
  const approvedPatterns = parseJSON<{ pattern: string; rationale: string }[]>(brandVersion?.approvedPatterns, []);
  const rejectedPatterns = parseJSON<{ pattern: string; rationale: string }[]>(brandVersion?.rejectedPatterns, []);
  const health = client.healthScores[0];
  const healthFactors = parseJSON<{ signal: string; value: string; penalty: number; explanation: string }[]>(health?.factors, []);
  const opportunities = await getOpportunitiesForClient(client.id, actor.organizationId);
  const renewalRecommendation = await getClientRenewalRecommendation(client.id, actor.organizationId);
  const cedarBrainActivity = await getRecentCedarBrainActivityForClient(client.id, actor.organizationId);
  // Separate from client.projects (which is capped to PREVIEW_LIMIT most
  // recent) — the picker needs the full set of projects to tag against,
  // bounded to a sane cap rather than paginated since a picker with
  // hundreds of options wouldn't be usable anyway.
  const allProjects = await prisma.project.findMany({
    where: { clientId: client.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 100,
  });
  // Same bounded-picker rationale as allProjects above — feeds
  // AddExpenseForm's campaign picker, scoped client-side to whichever
  // project is selected.
  const allCampaigns = await prisma.campaign.findMany({
    where: { projectId: { in: allProjects.map((p) => p.id) } },
    select: { id: true, name: true, projectId: true },
    orderBy: { name: "asc" },
    take: 100,
  });
  // Section 13's Meetings card — a compact preview matching the
  // Invoices/Expenses cards' shape, plus an inline "+ New meeting"
  // shortcut pre-locked to this client (see NewMeetingForm's `lockClient`).
  const clientMeetings = await listMeetingsForClient({
    actorUserId: actor.user.id,
    organizationId: actor.organizationId,
    clientId: client.id,
  });
  const orgMembers = canWrite
    ? await prisma.membership.findMany({
        where: { organizationId: actor.organizationId, status: "ACTIVE" },
        include: { user: true },
        orderBy: { user: { name: "asc" } },
      })
    : [];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{client.name}</h1>
          <p className="text-sm text-neutral-500">{client.companyName}</p>
        </div>
        {health && (
          <details className="group rounded-lg border border-neutral-200 bg-white px-4 py-2 text-center">
            <summary className="cursor-pointer list-none">
              <div className="text-xs text-neutral-500">Client Health</div>
              <div className="text-xl font-semibold text-cedar-700">{health.score}</div>
            </summary>
            {healthFactors.length > 0 && (
              <ul className="mt-2 w-64 space-y-1 text-left text-xs text-neutral-500">
                {healthFactors.map((f) => (
                  <li key={f.signal} className="flex justify-between gap-2">
                    <span title={f.explanation}>{f.value}</span>
                    <span className={f.penalty > 0 ? "text-red-500" : "text-neutral-300"}>
                      {f.penalty > 0 ? `-${f.penalty}` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        )}
      </div>

      <Card
        title="Renewal recommendation"
        action={<span className="text-xs text-neutral-400">Decision support, not autonomous truth (Section 20)</span>}
      >
        <div className="mb-3 flex items-center gap-2">
          <span
            className={
              renewalRecommendation.recommendation === "renew"
                ? "rounded-full bg-cedar-100 px-3 py-1 text-xs font-medium text-cedar-800"
                : renewalRecommendation.recommendation === "at_risk"
                  ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
                  : "rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800"
            }
          >
            {renewalRecommendation.recommendation === "renew"
              ? "Renew"
              : renewalRecommendation.recommendation === "at_risk"
                ? "At risk"
                : "Do not renew"}
          </span>
          <span className="text-xs text-neutral-400">Requires human review — no action is taken automatically.</span>
        </div>
        <ul className="space-y-1 text-sm text-neutral-600">
          {renewalRecommendation.evidence.map((line) => (
            <li key={line}>- {line}</li>
          ))}
        </ul>
        {renewalRecommendation.risks.length > 0 && (
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Risks</h4>
            <ul className="space-y-1 text-sm text-red-600">
              {renewalRecommendation.risks.map((line) => (
                <li key={line}>- {line}</li>
              ))}
            </ul>
          </div>
        )}
        <details className="mt-3 text-xs text-neutral-400">
          <summary className="cursor-pointer">Assumptions</summary>
          <ul className="mt-1 space-y-1">
            {renewalRecommendation.assumptions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      </Card>

      {opportunities.length > 0 && (
        <Card
          title="Opportunities"
          action={<span className="text-xs text-neutral-400">Decision support, not a recommendation (Section 4.2)</span>}
        >
          <ul className="space-y-2 text-sm">
            {opportunities.map((o) => (
              <li key={`${o.type}-${o.label}`} className="flex items-center justify-between gap-4">
                <span>
                  <span className="rounded-full bg-cedar-50 px-2 py-0.5 text-xs text-cedar-700">
                    {o.type === "service_gap" ? "Service" : "Format"}
                  </span>{" "}
                  <span className="font-medium">{o.label}</span>
                </span>
                <span className="text-xs text-neutral-500">{o.evidence}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Client info">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Status</dt>
              <dd>{client.lifecycleStage}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Industry</dt>
              <dd>{client.industry ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Contact</dt>
              <dd>{client.primaryContactName ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Email</dt>
              <dd>{client.primaryContactEmail ?? "—"}</dd>
            </div>
          </dl>
          {services.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1">
              {services.map((s) => (
                <span key={s} className="rounded-full bg-cedar-50 px-2 py-0.5 text-xs text-cedar-700">
                  {s}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card
          title={brandVersion ? `Brand DNA — v${brandVersion.version}` : "Brand DNA"}
          className="lg:col-span-2"
          action={
            canWrite && (
              <Link href={`/clients/${client.id}/brand/edit`} className="text-xs text-cedar-700 hover:underline">
                {brandVersion ? "Edit (new version)" : "Add Brand DNA"}
              </Link>
            )
          }
        >
          {!brandVersion ? (
            <p className="text-sm text-neutral-400">
              No Brand DNA captured yet — the AI will need to be told the brand every time until this is filled in.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-neutral-500">Colors</div>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <div key={c.hex} className="flex items-center gap-1 text-xs">
                      <span
                        className="h-4 w-4 rounded-full border border-neutral-200"
                        style={{ backgroundColor: c.hex }}
                      />
                      {c.name}
                    </div>
                  ))}
                  {colors.length === 0 && <span className="text-xs text-neutral-400">—</span>}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-neutral-500">Fonts</div>
                <ul className="text-sm">
                  {fonts.map((f) => (
                    <li key={f.role}>
                      {f.role}: <span className="font-medium">{f.family}</span>
                    </li>
                  ))}
                  {fonts.length === 0 && <span className="text-xs text-neutral-400">—</span>}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-neutral-500">Tone of voice</div>
                <p className="text-sm">{brandVersion.toneOfVoice ?? "—"}</p>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-neutral-500">Target audience</div>
                <p className="text-sm">{brandVersion.targetAudience ?? "—"}</p>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-neutral-500">Products</div>
                <div className="flex flex-wrap gap-1">
                  {products.map((p) => (
                    <span key={p} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                      {p}
                    </span>
                  ))}
                  {products.length === 0 && <span className="text-xs text-neutral-400">—</span>}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1 text-xs font-medium text-neutral-500">Approved patterns</div>
                <ul className="text-sm">
                  {approvedPatterns.map((p, i) => (
                    <li key={i}>
                      <span className="font-medium">{p.pattern}</span>
                      {p.rationale && <span className="text-neutral-400"> — {p.rationale}</span>}
                    </li>
                  ))}
                  {approvedPatterns.length === 0 && <span className="text-xs text-neutral-400">—</span>}
                </ul>
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1 text-xs font-medium text-neutral-500">Rejected patterns</div>
                <ul className="text-sm">
                  {rejectedPatterns.map((p, i) => (
                    <li key={i}>
                      <span className="font-medium">{p.pattern}</span>
                      {p.rationale && <span className="text-neutral-400"> — {p.rationale}</span>}
                    </li>
                  ))}
                  {rejectedPatterns.length === 0 && <span className="text-xs text-neutral-400">—</span>}
                </ul>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Projects"
          action={
            <div className="flex items-center gap-3">
              {client._count.projects > client.projects.length && (
                <Link href={`/clients/${client.id}/projects`} className="text-xs text-cedar-700 hover:underline">
                  View all ({client._count.projects})
                </Link>
              )}
              <Link href={`/clients/${client.id}/content`} className="text-xs text-cedar-700 hover:underline">
                Content Calendar
              </Link>
              <Link href={`/clients/${client.id}/shoots`} className="text-xs text-cedar-700 hover:underline">
                Shoots
              </Link>
              {canWrite && <NewProjectForm clientId={client.id} />}
            </div>
          }
        >
          {client.projects.length === 0 ? (
            <p className="mb-3 text-sm text-neutral-400">No projects yet.</p>
          ) : (
            <ul className="mb-3 space-y-3">
              {client.projects.map((p) => (
                <li key={p.id} className="text-sm">
                  <Link href={`/clients/${client.id}/projects/${p.id}`} className="block hover:text-cedar-700">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-neutral-500">{p.status}</span>
                    </div>
                    <div className="text-xs text-neutral-400">
                      {p._count.campaigns} campaign(s) · {p._count.tasks} task(s)
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <NewProjectFromTemplateForm
              clientId={client.id}
              templates={[...projectTemplates]
                .sort((a, b) => (templateUsageCounts.get(b.id) ?? 0) - (templateUsageCounts.get(a.id) ?? 0))
                .map((t) => ({ id: t.id, name: t.name, taskCount: t.tasks.length, usageCount: templateUsageCounts.get(t.id) ?? 0 }))}
            />
          )}
        </Card>

        <Card
          title="Client timeline"
          action={
            client._count.timelineEvents > client.timelineEvents.length && (
              <Link href={`/clients/${client.id}/timeline`} className="text-xs text-cedar-700 hover:underline">
                View all ({client._count.timelineEvents})
              </Link>
            )
          }
        >
          {client.timelineEvents.length === 0 ? (
            <p className="text-sm text-neutral-400">No history recorded yet.</p>
          ) : (
            <ol className="space-y-3 border-l border-neutral-200 pl-4">
              {client.timelineEvents.map((e) => (
                <li key={e.id} className="text-sm">
                  <div className="text-xs text-neutral-400">{e.occurredAt.toLocaleDateString()}</div>
                  <div>{e.summary}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Invoices"
          action={
            <div className="flex items-center gap-3">
              {client._count.invoices > client.invoices.length && (
                <Link href={`/clients/${client.id}/invoices`} className="text-xs text-cedar-700 hover:underline">
                  View all ({client._count.invoices})
                </Link>
              )}
              {canWriteFinance && <AddInvoiceForm clientId={client.id} projects={allProjects} />}
            </div>
          }
        >
          {client.invoices.length === 0 ? (
            <p className="text-sm text-neutral-400">No invoices yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {client.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2">
                  <span>{inv.issuedAt.toLocaleDateString()}</span>
                  <span>${(inv.amountCents / 100).toLocaleString()}</span>
                  <span className="text-xs text-neutral-500">{inv.status}</span>
                  {canWriteFinance && <InvoiceActions invoiceId={inv.id} status={inv.status} />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Expenses"
          action={
            <div className="flex items-center gap-3">
              {client._count.expenses > client.expenses.length && (
                <Link href={`/clients/${client.id}/expenses`} className="text-xs text-cedar-700 hover:underline">
                  View all ({client._count.expenses})
                </Link>
              )}
              {canWriteFinance && <AddExpenseForm clientId={client.id} projects={allProjects} campaigns={allCampaigns} />}
            </div>
          }
        >
          {client.expenses.length === 0 ? (
            <p className="text-sm text-neutral-400">No expenses logged against this client yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {client.expenses.map((exp) => (
                <li key={exp.id} className="flex justify-between">
                  <span>
                    {exp.incurredAt.toLocaleDateString()} — {exp.category}
                  </span>
                  <span>${(exp.amountCents / 100).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Notes"
          action={
            client._count.notes > client.notes.length && (
              <Link href={`/clients/${client.id}/notes`} className="text-xs text-cedar-700 hover:underline">
                View all ({client._count.notes})
              </Link>
            )
          }
        >
          {client.notes.length === 0 ? (
            <p className="text-sm text-neutral-400">No notes yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {client.notes.map((n) => (
                <li key={n.id}>{n.body}</li>
              ))}
            </ul>
          )}
          {canWrite && <AddNoteForm clientId={client.id} />}
        </Card>

        <Card
          title="Meetings"
          action={
            <Link href="/meetings" className="text-xs text-cedar-700 hover:underline">
              View all
            </Link>
          }
        >
          {clientMeetings.length === 0 ? (
            <p className="mb-3 text-sm text-neutral-400">No meetings logged yet.</p>
          ) : (
            <ul className="mb-3 space-y-2 text-sm">
              {clientMeetings.slice(0, 5).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <Link href={`/meetings/${m.id}`} className="hover:text-cedar-700 hover:underline">
                    {m.title}
                  </Link>
                  <span className="text-xs text-neutral-400">{m.occurredAt.toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <NewMeetingForm
              clients={[{ id: client.id, name: client.name }]}
              canCreateInternal={false}
              lockClient
              defaultClientId={client.id}
              members={orgMembers.map((m) => ({ id: m.id, name: m.user.name }))}
            />
          )}
        </Card>

        {cedarBrainActivity.length > 0 && (
          <Card
            title="Cedar Brain Activity"
            action={<span className="text-xs text-neutral-400">Client Memory (Section 6.6)</span>}
          >
            <ul className="space-y-3 text-sm">
              {cedarBrainActivity.map((a) => (
                <li key={a.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-neutral-400">{a.createdAt.toLocaleDateString()}</span>
                    <span className="flex gap-2">
                      {!a.success && <span className="text-xs text-red-600">failed</span>}
                      {a.flaggedIncorrect && <span className="text-xs text-amber-600">flagged incorrect</span>}
                    </span>
                  </div>
                  <div className="font-medium">{a.prompt}</div>
                  {a.summaryExcerpt && <div className="text-neutral-500">{a.summaryExcerpt}</div>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Card
        title="Files"
        action={
          <div className="flex items-center gap-3">
            {client._count.assets > client.assets.length && (
              <Link href={`/clients/${client.id}/files`} className="text-xs text-cedar-700 hover:underline">
                View all ({client._count.assets})
              </Link>
            )}
            {canWrite && <AssetUploadForm clientId={client.id} />}
          </div>
        }
      >
        {client.assets.length === 0 ? (
          <p className="text-sm text-neutral-400">No files uploaded yet.</p>
        ) : (
          <AssetsList
            canWrite={canWrite}
            assets={client.assets.map((a) => ({
              id: a.id,
              filename: a.filename,
              sizeBytes: a.sizeBytes,
              downloadUrl: buildSignedDownloadPath(a.id),
              uploadedByName: a.uploadedBy?.user.name ?? null,
              createdAt: a.createdAt.toISOString(),
            }))}
          />
        )}
      </Card>
    </div>
  );
}

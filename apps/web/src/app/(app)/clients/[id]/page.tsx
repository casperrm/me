import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { NewProjectForm } from "./NewProjectForm";
import { AssetUploadForm } from "./AssetUploadForm";
import { AssetsList } from "./AssetsList";
import { AddExpenseForm } from "./AddExpenseForm";
import { buildSignedDownloadPath } from "@/lib/storage";

export const dynamic = "force-dynamic";

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
      projects: { include: { campaigns: true, tasks: true } },
      invoices: { orderBy: { issuedAt: "desc" } },
      expenses: { orderBy: { incurredAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
      timelineEvents: { orderBy: { occurredAt: "desc" } },
      healthScores: { orderBy: { computedAt: "desc" }, take: 1 },
      assets: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { include: { user: true } } } },
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

  const brandVersion = client.brandProfile?.versions[0];
  const services = parseJSON<string[]>(client.services, []);
  const colors = parseJSON<{ name: string; hex: string }[]>(brandVersion?.colors, []);
  const fonts = parseJSON<{ role: string; family: string }[]>(brandVersion?.fonts, []);
  const products = parseJSON<string[]>(brandVersion?.products, []);
  const approvedPatterns = parseJSON<{ pattern: string; rationale: string }[]>(brandVersion?.approvedPatterns, []);
  const rejectedPatterns = parseJSON<{ pattern: string; rationale: string }[]>(brandVersion?.rejectedPatterns, []);
  const health = client.healthScores[0];
  const healthFactors = parseJSON<{ signal: string; value: string; penalty: number; explanation: string }[]>(health?.factors, []);

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
            <p className="text-sm text-neutral-400">No projects yet.</p>
          ) : (
            <ul className="space-y-3">
              {client.projects.map((p) => (
                <li key={p.id} className="text-sm">
                  <Link href={`/clients/${client.id}/projects/${p.id}`} className="block hover:text-cedar-700">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-neutral-500">{p.status}</span>
                    </div>
                    <div className="text-xs text-neutral-400">
                      {p.campaigns.length} campaign(s) · {p.tasks.length} task(s)
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Client timeline">
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
        <Card title="Invoices">
          {client.invoices.length === 0 ? (
            <p className="text-sm text-neutral-400">No invoices yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {client.invoices.map((inv) => (
                <li key={inv.id} className="flex justify-between">
                  <span>{inv.issuedAt.toLocaleDateString()}</span>
                  <span>${(inv.amountCents / 100).toLocaleString()}</span>
                  <span className="text-xs text-neutral-500">{inv.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Expenses" action={canWriteFinance && <AddExpenseForm clientId={client.id} />}>
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

        <Card title="Notes">
          {client.notes.length === 0 ? (
            <p className="text-sm text-neutral-400">No notes yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {client.notes.map((n) => (
                <li key={n.id}>{n.body}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Files" action={canWrite && <AssetUploadForm clientId={client.id} />}>
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

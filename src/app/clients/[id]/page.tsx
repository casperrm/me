import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/Card";

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export default async function ClientProfilePage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      brandDNA: true,
      projects: { include: { campaigns: true, tasks: true } },
      invoices: { orderBy: { issuedAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
      timelineEvents: { orderBy: { occurredAt: "desc" } },
      healthScores: { orderBy: { computedAt: "desc" }, take: 1 },
    },
  });

  if (!client) notFound();

  const services = parseJSON<string[]>(client.services, []);
  const colors = parseJSON<{ name: string; hex: string }[]>(client.brandDNA?.colors, []);
  const fonts = parseJSON<{ role: string; family: string }[]>(client.brandDNA?.fonts, []);
  const health = client.healthScores[0];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{client.name}</h1>
          <p className="text-sm text-neutral-500">{client.companyName}</p>
        </div>
        {health && (
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-center">
            <div className="text-xs text-neutral-500">Client Health</div>
            <div className="text-xl font-semibold text-cedar-700">{health.score}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Client info">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Status</dt>
              <dd>{client.status}</dd>
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

        <Card title="Brand DNA" className="lg:col-span-2">
          {!client.brandDNA ? (
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
                <p className="text-sm">{client.brandDNA.toneOfVoice ?? "—"}</p>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-neutral-500">Target audience</div>
                <p className="text-sm">{client.brandDNA.targetAudience ?? "—"}</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Projects">
          {client.projects.length === 0 ? (
            <p className="text-sm text-neutral-400">No projects yet.</p>
          ) : (
            <ul className="space-y-3">
              {client.projects.map((p) => (
                <li key={p.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-neutral-500">{p.status}</span>
                  </div>
                  <div className="text-xs text-neutral-400">
                    {p.campaigns.length} campaign(s) · {p.tasks.length} task(s)
                  </div>
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
    </div>
  );
}

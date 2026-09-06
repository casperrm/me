import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { NewShootForm } from "./NewShootForm";
import { ShootStatusForm } from "./ShootStatusForm";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  PLANNED: "bg-neutral-100 text-neutral-600",
  CONFIRMED: "bg-cedar-50 text-cedar-700",
  COMPLETED: "bg-cedar-100 text-cedar-800",
  CANCELED: "bg-red-50 text-red-700",
};

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export default async function ShootsPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (!allowed) return <PermissionDenied message="You don't have access to this client's shoots." />;

  const canWrite = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:write",
    clientId: client.id,
  });

  const [shoots, projects] = await Promise.all([
    prisma.shoot.findMany({ where: { clientId: client.id }, orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }] }),
    prisma.project.findMany({ where: { clientId: client.id }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${client.id}`} className="text-xs text-cedar-700 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Shoots</h1>
        <p className="text-sm text-neutral-500">
          Photography / production scheduling for {client.name} (Bible Section 11.2).
        </p>
      </div>

      <Card action={canWrite && <NewShootForm clientId={client.id} projects={projects.map((p) => ({ id: p.id, label: p.name }))} />}>
        {shoots.length === 0 ? (
          <p className="text-sm text-neutral-400">No shoots scheduled yet.</p>
        ) : (
          <ul className="space-y-4">
            {shoots.map((shoot) => {
              const crew = parseJSON<{ name: string; role: string; contact?: string }[]>(shoot.crew, []);
              return (
                <li key={shoot.id} className="border-b border-neutral-50 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{shoot.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[shoot.status] ?? ""}`}>{shoot.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {shoot.scheduledAt ? shoot.scheduledAt.toLocaleDateString() : "No date set"}
                    {shoot.location && ` · ${shoot.location}`}
                  </div>
                  {shoot.callSheetNotes && <p className="mt-1 text-sm text-neutral-600">{shoot.callSheetNotes}</p>}
                  {crew.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {crew.map((c, i) => (
                        <span key={i} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                          {c.name} — {c.role}
                        </span>
                      ))}
                    </div>
                  )}
                  {canWrite && (
                    <div className="mt-2">
                      <ShootStatusForm shootId={shoot.id} status={shoot.status} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

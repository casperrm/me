import { notFound } from "next/navigation";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { checkPermission } from "@/lib/guards";
import { EditClientForm } from "./EditClientForm";

export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Client-scoped clients:write — editing an existing client is a write
  // on that specific client, not an org-wide "brand new resource" write
  // like createClient requires. Matches createProject/createShoot/
  // createNote's own tier for writes on an already-existing client.
  const { allowed, actor } = await checkPermission("clients:write", id);
  if (!allowed || !actor) {
    return <PermissionDenied message="Editing this client requires clients:write for this client. Ask an owner or admin." />;
  }

  const client = await prisma.client.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Edit {client.name}</h1>
        <p className="text-sm text-neutral-500">Update this client&apos;s core details (Section 4).</p>
      </div>
      <Card>
        <EditClientForm
          clientId={client.id}
          initial={{
            name: client.name,
            companyName: client.companyName,
            industry: client.industry ?? "",
            lifecycleStage: client.lifecycleStage,
            primaryContactName: client.primaryContactName ?? "",
            primaryContactEmail: client.primaryContactEmail ?? "",
          }}
        />
      </Card>
    </div>
  );
}

import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { checkPermission } from "@/lib/guards";
import { NewClientForm } from "./NewClientForm";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  // Creating a brand-new Client doesn't belong to any existing client yet,
  // so this is gated the same org-wide way as Project Templates and other
  // "brand new resource" writes: clients:write with no clientId (OWNER,
  // ADMIN, or an explicit org-wide ScopedGrant only).
  const { allowed } = await checkPermission("clients:write");
  if (!allowed) {
    return <PermissionDenied message="Creating a client requires clients:write organization-wide. Ask an owner or admin." />;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Client</h1>
        <p className="text-sm text-neutral-500">Section 4: one profile per client — brand, projects, files, approvals, billing.</p>
      </div>
      <Card>
        <NewClientForm />
      </Card>
    </div>
  );
}

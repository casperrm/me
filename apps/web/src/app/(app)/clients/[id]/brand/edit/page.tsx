import { notFound } from "next/navigation";
import { prisma } from "@cedar/db";
import { checkPermission } from "@/lib/guards";
import { PermissionDenied } from "@/components/PermissionDenied";
import { BrandDnaForm } from "./BrandDnaForm";

export const dynamic = "force-dynamic";

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export default async function EditBrandDnaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { allowed, actor } = await checkPermission("clients:write", id);
  if (!allowed || !actor) return <PermissionDenied message="You don't have permission to edit this client's Brand DNA." />;

  const client = await prisma.client.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { brandProfile: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } },
  });
  if (!client) notFound();

  const latest = client.brandProfile?.versions[0];

  const initial = {
    colors: parseJSON<{ name: string; hex: string }[]>(latest?.colors, []),
    fonts: parseJSON<{ role: string; family: string }[]>(latest?.fonts, []),
    toneOfVoice: latest?.toneOfVoice ?? "",
    visualStyle: latest?.visualStyle ?? "",
    targetAudience: latest?.targetAudience ?? "",
    products: parseJSON<string[]>(latest?.products, []),
    approvedPatterns: parseJSON<{ pattern: string; rationale: string }[]>(latest?.approvedPatterns, []),
    rejectedPatterns: parseJSON<{ pattern: string; rationale: string }[]>(latest?.rejectedPatterns, []),
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Edit Brand DNA — {client.name}</h1>
        <p className="text-sm text-neutral-500">
          Saving creates a new version (currently v{client.brandProfile?.currentVersion ?? 0}) rather than overwriting
          history — historical creative stays evaluated against the rules active when it was made (Section 5).
        </p>
      </div>
      <BrandDnaForm clientId={client.id} initial={initial} />
    </div>
  );
}

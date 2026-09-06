import { prisma } from "@cedar/db";
import { requireActor } from "@/lib/guards";
import { getReadableClientIds } from "@/lib/readable-clients";
import { CommandCenterForm } from "./CommandCenterForm";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const actor = await requireActor();

  // Same client-isolation query pattern as /clients — the picker must
  // never offer a client the actor can't actually read (Section 38).
  const clientIdFilter = await getReadableClientIds(actor);
  const clients = await prisma.client.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(clientIdFilter ? { id: { in: clientIdFilter } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return <CommandCenterForm clients={clients} />;
}

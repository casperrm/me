import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@cedar/db";
import { requireActor } from "@/lib/guards";

export const dynamic = "force-dynamic";

// Landing page for the Client Portal (Bible Section 15.2). A portal
// contact's access is entirely defined by their ScopedGrant(clients:read)
// rows — there is no separate "portal membership" concept — so this page
// just lists whichever clients those grants point at.
export default async function PortalLandingPage() {
  const actor = await requireActor();

  const grants = await prisma.scopedGrant.findMany({
    where: { membershipId: actor.membership.id, permission: "clients:read", clientId: { not: null } },
    include: { client: true },
  });

  const clients = grants
    .map((g) => g.client)
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .filter((c, i, arr) => arr.findIndex((other) => other.id === c.id) === i);

  if (clients.length === 1) {
    redirect(`/portal/${clients[0].id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Client Portal</h1>
        <p className="text-sm text-neutral-500">Choose a client to view approvals, files, and invoices.</p>
      </div>
      {clients.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-sm font-semibold text-amber-800">No client access yet</h2>
          <p className="mt-1 text-sm text-amber-700">
            Ask your account manager to grant you access to a client.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => (
            <li key={c.id}>
              <Link
                href={`/portal/${c.id}`}
                className="block rounded-xl border border-neutral-200 bg-white p-4 text-sm font-medium text-neutral-800 shadow-sm hover:border-cedar-300 hover:text-cedar-800"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { prisma } from "@cedar/db";
import { checkPermission } from "@/lib/guards";
import { PermissionDenied } from "@/components/PermissionDenied";
import { Card } from "@/components/Card";
import { InviteForm } from "./InviteForm";
import { changeRoleAction, revokeMembershipAction, grantClientScopeAction } from "@/lib/actions/membership";

export const dynamic = "force-dynamic";

const ASSIGNABLE_ROLES = [
  "ADMIN",
  "ACCOUNT_MANAGER",
  "ADS_MANAGER",
  "DESIGNER",
  "VIDEO_PRODUCTION",
  "FINANCE",
  "CLIENT_PORTAL",
  "CUSTOM",
] as const;

export default async function TeamPage() {
  const canInvite = await checkPermission("members:invite");
  const canManage = await checkPermission("members:manage");

  if (!canInvite.allowed && !canManage.allowed) {
    return <PermissionDenied message="Team & Permissions is limited to Owner/Admin." />;
  }

  const actor = canInvite.actor ?? canManage.actor;
  if (!actor) return null;

  const [memberships, invitations, clients] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: actor.organizationId },
      include: { user: true, scopedGrants: { include: { client: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { organizationId: actor.organizationId, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true } }),
  ]);

  const ownerCount = memberships.filter((m) => m.role === "OWNER" && m.status === "ACTIVE").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Team & Permissions</h1>
        <p className="text-sm text-neutral-500">
          Invite-only access, roles, and per-client scoping (Bible Section 2, 29).
        </p>
      </div>

      {canInvite.allowed && (
        <Card title="Invite a member">
          <InviteForm roles={ASSIGNABLE_ROLES} />
        </Card>
      )}

      {invitations.length > 0 && canManage.allowed && (
        <Card title="Pending invitations">
          <ul className="space-y-2 text-sm">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between">
                <span>
                  {inv.email} <span className="text-neutral-400">— {inv.role}</span>
                </span>
                <span className="text-xs text-neutral-400">expires {inv.expiresAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Members">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs text-neutral-500">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Client scopes</th>
                {canManage.allowed && <th className="pb-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => {
                const isLastOwner = m.role === "OWNER" && ownerCount <= 1;
                return (
                  <tr key={m.id} className="border-b border-neutral-50">
                    <td className="py-2 pr-4">{m.user.name}</td>
                    <td className="py-2 pr-4 text-neutral-500">{m.user.email}</td>
                    <td className="py-2 pr-4">{m.role}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          m.status === "ACTIVE"
                            ? "rounded-full bg-cedar-100 px-2 py-0.5 text-xs text-cedar-800"
                            : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                        }
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-neutral-500">
                      {m.scopedGrants.length === 0
                        ? "—"
                        : m.scopedGrants.map((g) => `${g.client?.name ?? "org-wide"}: ${g.permission}`).join(", ")}
                    </td>
                    {canManage.allowed && (
                      <td className="space-y-1 py-2">
                        {!isLastOwner && (
                          <>
                            <form action={changeRoleAction} className="flex items-center gap-1">
                              <input type="hidden" name="membershipId" value={m.id} />
                              <select name="role" defaultValue={m.role} className="rounded border border-neutral-200 px-1 py-0.5 text-xs">
                                <option value="OWNER" disabled>
                                  OWNER
                                </option>
                                {ASSIGNABLE_ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                              <button type="submit" className="text-xs text-cedar-700 hover:underline">
                                Save
                              </button>
                            </form>
                            {m.status === "ACTIVE" && (
                              <form action={revokeMembershipAction}>
                                <input type="hidden" name="membershipId" value={m.id} />
                                <button type="submit" className="text-xs text-red-600 hover:underline">
                                  Revoke access
                                </button>
                              </form>
                            )}
                            {clients.length > 0 && (
                              <form action={grantClientScopeAction} className="flex items-center gap-1">
                                <input type="hidden" name="membershipId" value={m.id} />
                                <select name="clientId" className="rounded border border-neutral-200 px-1 py-0.5 text-xs">
                                  {clients.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                                <select name="permission" className="rounded border border-neutral-200 px-1 py-0.5 text-xs">
                                  <option value="clients:read">clients:read</option>
                                  <option value="clients:write">clients:write</option>
                                </select>
                                <button type="submit" className="text-xs text-cedar-700 hover:underline">
                                  Grant
                                </button>
                              </form>
                            )}
                          </>
                        )}
                        {isLastOwner && <span className="text-xs text-neutral-400">Last owner — protected</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

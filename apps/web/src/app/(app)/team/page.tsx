import { prisma } from "@cedar/db";
import { checkPermission } from "@/lib/guards";
import { PermissionDenied } from "@/components/PermissionDenied";
import { Card } from "@/components/Card";
import { InviteForm } from "./InviteForm";
import { SetMfaPolicyForm } from "./SetMfaPolicyForm";
import { MemberRowActions } from "./MemberRowActions";
import { getMfaPolicy } from "@/lib/services/mfa-policy-service";

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

  const canManageOrgPolicy = await checkPermission("organization:manage");

  const [memberships, invitations, clients, mfaPolicy] = await Promise.all([
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
    getMfaPolicy(actor.organizationId),
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

      <Card title="Security policy">
        <p className="text-sm text-neutral-600">
          {mfaPolicy.requiredForPrivilegedRoles
            ? "Two-factor authentication is required for Owner and Admin roles. A member with either role who hasn't enrolled yet is redirected to Security until they do."
            : "Two-factor authentication is optional (Section 23.1) — Owner and Admin members can enroll from Security, but aren't required to."}
        </p>
        {canManageOrgPolicy.allowed ? (
          <SetMfaPolicyForm currentlyRequired={mfaPolicy.requiredForPrivilegedRoles} />
        ) : (
          <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-400">
            Only an owner or admin (organization:manage) can change this.
          </p>
        )}
      </Card>

      {canInvite.allowed && (
        <Card title="Invite a member">
          <InviteForm roles={ASSIGNABLE_ROLES} clients={clients} />
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
                          <MemberRowActions
                            membershipId={m.id}
                            role={m.role}
                            status={m.status}
                            clients={clients}
                            assignableRoles={ASSIGNABLE_ROLES}
                          />
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

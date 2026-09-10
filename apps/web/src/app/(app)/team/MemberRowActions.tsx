"use client";

import { useState, useTransition } from "react";
import { changeRoleAction, grantClientScopeAction, revokeMembershipAction } from "@/lib/actions/membership";

// The Team page only hides these forms for the *last remaining* OWNER.
// It does not hide them when the target is a non-last OWNER and the
// viewing actor is an ADMIN rather than an OWNER - policy.ts's
// canManageMembership forbids exactly that combination, so both
// changeRoleAction and revokeMembershipAction return {error} instead of
// throwing when it happens. Handled here with real client-side state
// rather than letting it hit the page's error.tsx boundary.
export function MemberRowActions({
  membershipId,
  role,
  status,
  version,
  clients,
  assignableRoles,
}: {
  membershipId: string;
  role: string;
  status: string;
  /** Membership.version as of this page's last render — see the module comment. */
  version: number;
  clients: { id: string; name: string }[];
  assignableRoles: readonly string[];
}) {
  const [roleError, setRoleError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [isRolePending, startRoleTransition] = useTransition();
  const [isRevokePending, startRevokeTransition] = useTransition();

  function handleRoleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRoleError(null);
    const formData = new FormData(e.currentTarget);
    startRoleTransition(async () => {
      const result = await changeRoleAction(formData);
      if (result?.error) setRoleError(result.error);
    });
  }

  function handleRevokeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRevokeError(null);
    const formData = new FormData(e.currentTarget);
    startRevokeTransition(async () => {
      const result = await revokeMembershipAction(formData);
      if (result?.error) setRevokeError(result.error);
    });
  }

  return (
    <>
      <form onSubmit={handleRoleSubmit} className="flex items-center gap-1">
        <input type="hidden" name="membershipId" value={membershipId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <select
          name="role"
          defaultValue={role}
          disabled={isRolePending}
          className="rounded border border-neutral-200 px-1 py-0.5 text-xs disabled:opacity-60"
        >
          <option value="OWNER" disabled>
            OWNER
          </option>
          {assignableRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="submit" disabled={isRolePending} className="text-xs text-cedar-700 hover:underline">
          Save
        </button>
      </form>
      {roleError && <p className="text-xs text-red-600">{roleError}</p>}

      {status === "ACTIVE" && (
        <>
          <form onSubmit={handleRevokeSubmit}>
            <input type="hidden" name="membershipId" value={membershipId} />
            <input type="hidden" name="expectedVersion" value={version} />
            <button type="submit" disabled={isRevokePending} className="text-xs text-red-600 hover:underline">
              Revoke access
            </button>
          </form>
          {revokeError && <p className="text-xs text-red-600">{revokeError}</p>}
        </>
      )}

      {clients.length > 0 && (
        <form action={grantClientScopeAction} className="flex items-center gap-1">
          <input type="hidden" name="membershipId" value={membershipId} />
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
  );
}

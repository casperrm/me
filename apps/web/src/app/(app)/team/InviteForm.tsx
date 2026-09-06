"use client";

import { useState } from "react";

export function InviteForm({ roles, clients }: { roles: readonly string[]; clients: { id: string; name: string }[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[0]);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isClientPortal = role === "CLIENT_PORTAL";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInviteLink(null);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role, clientId: isClientPortal ? clientId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setInviteLink(data.inviteLink);
      setEmail("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm focus:border-cedar-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm focus:border-cedar-400 focus:outline-none"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {isClientPortal && (
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Client (portal scope)</label>
            {clients.length === 0 ? (
              <p className="text-xs text-red-600">No clients exist yet — create one first.</p>
            ) : (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="rounded-md border border-neutral-200 px-3 py-2 text-sm focus:border-cedar-400 focus:outline-none"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={loading || (isClientPortal && clients.length === 0)}
          className="rounded-md bg-cedar-600 px-4 py-2 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send invite"}
        </button>
      </form>
      {isClientPortal && (
        <p className="mt-1 text-xs text-neutral-400">
          A Client Portal invite only grants access to the selected client — nothing else in the organization
          (Bible Section 15.2).
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {inviteLink && (
        <p className="mt-2 text-sm text-cedar-700">
          Invite created. Share this link (no email provider is wired up yet):{" "}
          <code className="rounded bg-cedar-50 px-1.5 py-0.5">{inviteLink}</code>
        </p>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface SessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  isCurrent: boolean;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString();
}

export function ActiveSessions({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRevoke(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/security/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not sign out that device.");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function onRevokeAllOthers() {
    setRevokingAll(true);
    setError(null);
    try {
      const res = await fetch("/api/security/sessions/revoke-all", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not sign out other devices.");
        return;
      }
      router.refresh();
    } finally {
      setRevokingAll(false);
    }
  }

  const otherSessionCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="space-y-2 text-sm">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-center justify-between gap-3 rounded-md border border-neutral-100 px-3 py-2">
            <div>
              <p className="font-medium text-neutral-800">
                {session.userAgent ?? "Unknown device"}
                {session.isCurrent && <span className="ml-2 text-xs font-normal text-cedar-700">(this device)</span>}
              </p>
              <p className="text-xs text-neutral-400">
                {session.ipAddress ?? "Unknown IP"} · signed in {formatWhen(session.createdAt)}
              </p>
            </div>
            {!session.isCurrent && (
              <button
                onClick={() => onRevoke(session.id)}
                disabled={busyId === session.id}
                className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                {busyId === session.id ? "Signing out…" : "Sign out"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {otherSessionCount > 0 && (
        <button
          onClick={onRevokeAllOthers}
          disabled={revokingAll}
          className="text-sm text-red-600 hover:underline disabled:opacity-50"
        >
          {revokingAll ? "Signing out other devices…" : `Sign out all ${otherSessionCount} other device(s)`}
        </button>
      )}
    </div>
  );
}

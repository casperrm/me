"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ClientOption {
  id: string;
  name: string;
}
interface MemberOption {
  id: string;
  name: string;
}

function todayDateInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Shared between the `/meetings` page (full picker) and the client 360
 * page's compact Meetings card (`lockClient` — client pre-selected,
 * dropdown hidden). `clients`/`canCreateInternal` are pre-scoped by the
 * caller to what the actor can actually write to
 * (`getWritableClientIds`), same "already-resolved scope" convention the
 * rest of this module follows.
 */
export function NewMeetingForm({
  clients,
  canCreateInternal,
  members,
  defaultClientId,
  lockClient = false,
}: {
  clients: ClientOption[];
  canCreateInternal: boolean;
  members: MemberOption[];
  defaultClientId?: string;
  lockClient?: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(defaultClientId ?? (canCreateInternal ? "" : (clients[0]?.id ?? "")));
  const [occurredAt, setOccurredAt] = useState(todayDateInputValue());
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          clientId: clientId || undefined,
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
          attendeeMembershipIds: attendeeIds,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      setTitle("");
      setAttendeeIds([]);
      setOccurredAt(todayDateInputValue());
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (clients.length === 0 && !canCreateInternal) return null;

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-4">
      <div className="flex-1 basis-full sm:basis-auto">
        <label className="mb-1 block text-xs font-medium text-neutral-600">New meeting</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Meeting title"
          className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm sm:w-48"
        />
      </div>

      {!lockClient && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Client</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
          >
            {canCreateInternal && <option value="">Internal (no client)</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Date</label>
        <input
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
      </div>

      {members.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Attendees</label>
          <div className="max-h-24 w-48 overflow-y-auto rounded-md border border-neutral-200 p-1.5">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 py-0.5 text-xs text-neutral-700">
                <input
                  type="checkbox"
                  checked={attendeeIds.includes(m.id)}
                  onChange={() => toggleAttendee(m.id)}
                />
                {m.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !title.trim()}
        className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create meeting"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

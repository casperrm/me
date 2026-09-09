"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface FollowUp {
  id: string;
  text: string;
  ownerMembershipId: string | null;
  dueDate: string | null;
  promotedTaskId: string | null;
}
interface MemberOption {
  id: string;
  name: string;
}
interface ProjectOption {
  id: string;
  name: string;
}
interface TaskLink {
  href: string;
  title: string;
}

function PromoteControl({
  meetingId,
  followUpId,
  projects,
}: {
  meetingId: string;
  followUpId: string;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (projects.length === 0) {
    return <span className="text-xs text-neutral-400">No eligible project to promote into.</span>;
  }

  async function onPromote() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/followups/${followUpId}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Could not promote this follow-up.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="rounded-md border border-neutral-200 px-1.5 py-1 text-xs"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onPromote}
        disabled={loading}
        className="whitespace-nowrap rounded-md border border-cedar-200 bg-cedar-50 px-2 py-1 text-xs font-medium text-cedar-700 hover:bg-cedar-100 disabled:opacity-50"
      >
        {loading ? "Promoting…" : "Promote to task →"}
      </button>
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function MeetingFollowUps({
  meetingId,
  followUps,
  members,
  projects,
  taskLinks,
}: {
  meetingId: string;
  followUps: FollowUp[];
  members: MemberOption[];
  projects: ProjectOption[];
  taskLinks: Record<string, TaskLink>;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [ownerMembershipId, setOwnerMembershipId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/followups`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          ownerMembershipId: ownerMembershipId || undefined,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      setText("");
      setOwnerMembershipId("");
      setDueDate("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {followUps.length === 0 ? (
        <p className="text-sm text-neutral-400">No follow-ups recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {followUps.map((f) => (
            <li key={f.id} className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm">
              <div className="font-medium text-neutral-800">{f.text}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                {memberName(f.ownerMembershipId) && <span>Owner: {memberName(f.ownerMembershipId)}</span>}
                {f.dueDate && <span>Due {new Date(f.dueDate).toLocaleDateString()}</span>}
              </div>
              <div className="mt-2">
                {f.promotedTaskId ? (
                  taskLinks[f.promotedTaskId] ? (
                    <Link href={taskLinks[f.promotedTaskId].href} className="text-xs text-cedar-700 hover:underline">
                      ✓ Task created — {taskLinks[f.promotedTaskId].title}
                    </Link>
                  ) : (
                    <span className="text-xs text-neutral-500">✓ Task created</span>
                  )
                ) : (
                  <PromoteControl meetingId={meetingId} followUpId={f.id} projects={projects} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
        <div className="flex-1 basis-full sm:basis-auto">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Follow-up</label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs to happen"
            className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm sm:w-56"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Owner</label>
          <select
            value={ownerMembershipId}
            onChange={(e) => setOwnerMembershipId(e.target.value)}
            className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add follow-up"}
        </button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}

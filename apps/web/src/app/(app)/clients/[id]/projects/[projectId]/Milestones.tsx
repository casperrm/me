"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface MilestoneItem {
  id: string;
  name: string;
  dueDate: string;
  done: boolean;
  overdue: boolean;
}

export function Milestones({ projectId, milestones, canWrite }: { projectId: string; milestones: MilestoneItem[]; canWrite: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dueDate) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, dueDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setName("");
      setDueDate("");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function toggleMilestone(id: string) {
    setPendingId(id);
    try {
      await fetch(`/api/milestones/${id}/toggle`, { method: "POST" });
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function deleteMilestone(id: string) {
    setPendingId(id);
    try {
      await fetch(`/api/milestones/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {milestones.length === 0 ? (
        <p className="text-sm text-neutral-400">No milestones yet.</p>
      ) : (
        <ul className="space-y-1">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={m.done}
                disabled={!canWrite || pendingId === m.id}
                onChange={() => toggleMilestone(m.id)}
                className="h-3.5 w-3.5"
              />
              <span className={m.done ? "text-neutral-400 line-through" : ""}>{m.name}</span>
              <span className="text-xs text-neutral-400">due {new Date(m.dueDate).toLocaleDateString()}</span>
              {m.overdue && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">Overdue</span>}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => deleteMilestone(m.id)}
                  disabled={pendingId === m.id}
                  className="text-xs text-neutral-300 hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form onSubmit={addMilestone} className="flex flex-wrap items-center gap-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Milestone name"
            className="w-40 rounded border border-neutral-200 px-2 py-1 text-xs"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded border border-neutral-200 px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={adding || !name.trim() || !dueDate}
            className="text-xs text-cedar-700 hover:underline disabled:opacity-50"
          >
            {adding ? "…" : "Add"}
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </form>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DependencyItem {
  id: string;
  blockedByTaskId: string;
  blockedByTaskTitle: string;
  blockedByTaskDone: boolean;
}

interface TaskOption {
  id: string;
  title: string;
}

export function TaskDependencies({
  taskId,
  dependencies,
  taskOptions,
  canWrite,
}: {
  taskId: string;
  dependencies: DependencyItem[];
  taskOptions: TaskOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addDependency(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/dependencies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blockedByTaskId: selected }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not add dependency.");
        return;
      }
      setSelected("");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function removeDependency(dependencyId: string) {
    setPendingId(dependencyId);
    try {
      await fetch(`/api/task-dependencies/${dependencyId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (dependencies.length === 0 && (!canWrite || taskOptions.length === 0)) return null;

  return (
    <div className="mt-2 ml-0 space-y-1">
      {dependencies.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {dependencies.map((dep) => (
            <li
              key={dep.id}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                dep.blockedByTaskDone ? "bg-neutral-100 text-neutral-400" : "bg-amber-100 text-amber-800"
              }`}
            >
              Blocked by: {dep.blockedByTaskTitle}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => removeDependency(dep.id)}
                  disabled={pendingId === dep.id}
                  className="text-neutral-400 hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && taskOptions.length > 0 && (
        <form onSubmit={addDependency} className="flex items-center gap-1">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded border border-neutral-200 px-1.5 py-0.5 text-xs"
          >
            <option value="">+ Blocked by…</option>
            {taskOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button type="submit" disabled={adding || !selected} className="text-xs text-cedar-700 hover:underline disabled:opacity-50">
            Add
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </form>
      )}
    </div>
  );
}

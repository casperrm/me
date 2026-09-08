"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TemplateTaskItem {
  id: string;
  title: string;
  priority: string;
}

const PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

export function TemplateTasks({ templateId, tasks }: { templateId: string; tasks: TemplateTaskItem[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/project-templates/${templateId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, priority }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Could not add task.");
        return;
      }
      setTitle("");
      setPriority("medium");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function removeTask(taskId: string) {
    setRemovingId(taskId);
    try {
      await fetch(`/api/project-template-tasks/${taskId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {tasks.length === 0 ? (
        <p className="text-xs text-neutral-400">No tasks yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <span className="text-neutral-700">
                {task.title} <span className="text-neutral-400">({PRIORITY_LABEL[task.priority] ?? task.priority})</span>
              </span>
              <button
                type="button"
                onClick={() => removeTask(task.id)}
                disabled={removingId === task.id}
                className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addTask} className="flex flex-wrap items-center gap-1 pt-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task title"
          className="w-44 rounded border border-neutral-200 px-2 py-1 text-xs"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded border border-neutral-200 px-1.5 py-1 text-xs"
        >
          {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={adding || !title.trim()}
          className="text-xs text-cedar-700 hover:underline disabled:opacity-50"
        >
          {adding ? "…" : "Add"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setTaskPriorityAction } from "@/lib/actions/task";

const PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };
const PRIORITY_COLOR: Record<string, string> = {
  low: "text-neutral-400",
  medium: "text-amber-600",
  high: "text-red-600",
};

export function TaskPriorityForm({
  taskId,
  clientId,
  projectId,
  priority,
}: {
  taskId: string;
  clientId: string;
  projectId: string;
  priority: string;
}) {
  const [selected, setSelected] = useState(priority);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setSelected(next);
    setError(null);

    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("clientId", clientId);
    formData.set("projectId", projectId);
    formData.set("priority", next);

    startTransition(async () => {
      const result = await setTaskPriorityAction(formData);
      if (result?.error) {
        setError(result.error);
        setSelected(priority);
      }
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <select
        name="priority"
        value={selected}
        onChange={handleChange}
        disabled={isPending}
        className={`rounded border border-neutral-200 bg-white px-1 py-0.5 text-xs disabled:opacity-60 ${PRIORITY_COLOR[selected] ?? ""}`}
      >
        {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

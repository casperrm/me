"use client";

import { useState, useTransition } from "react";
import { setTaskStatusAction } from "@/lib/actions/task";

const STATUS_LABEL: Record<string, string> = { todo: "To do", in_progress: "In progress", done: "Done" };

export function TaskStatusForm({
  taskId,
  clientId,
  projectId,
  status,
  openBlockerTitles = [],
}: {
  taskId: string;
  clientId: string;
  projectId: string;
  status: string;
  openBlockerTitles?: string[];
}) {
  const [selected, setSelected] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const blocked = openBlockerTitles.length > 0;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setSelected(next);
    setError(null);

    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("clientId", clientId);
    formData.set("projectId", projectId);
    formData.set("status", next);

    startTransition(async () => {
      const result = await setTaskStatusAction(formData);
      // A real, reachable failure: the "done" option is only disabled
      // based on blocker state as of page render, so a blocker added (or
      // completed) after that can make this rejection fire for real. Revert
      // the select to the last known-good value instead of leaving it
      // showing a change that didn't actually happen server-side.
      if (result?.error) {
        setError(result.error);
        setSelected(status);
      }
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <select
        name="status"
        value={selected}
        onChange={handleChange}
        disabled={isPending}
        title={blocked ? `Blocked by incomplete task(s): ${openBlockerTitles.join(", ")}` : undefined}
        className="rounded border border-neutral-200 px-1 py-0.5 text-xs disabled:opacity-60"
      >
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value} disabled={value === "done" && blocked}>
            {value === "done" && blocked ? `${label} (blocked)` : label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

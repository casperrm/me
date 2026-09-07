"use client";

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
  const blocked = openBlockerTitles.length > 0;

  return (
    <form action={setTaskStatusAction} className="flex items-center gap-1">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="projectId" value={projectId} />
      <select
        name="status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        title={blocked ? `Blocked by incomplete task(s): ${openBlockerTitles.join(", ")}` : undefined}
        className="rounded border border-neutral-200 px-1 py-0.5 text-xs"
      >
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value} disabled={value === "done" && blocked}>
            {value === "done" && blocked ? `${label} (blocked)` : label}
          </option>
        ))}
      </select>
    </form>
  );
}

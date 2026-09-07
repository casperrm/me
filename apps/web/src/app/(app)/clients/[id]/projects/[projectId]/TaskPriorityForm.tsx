"use client";

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
  return (
    <form action={setTaskPriorityAction} className="flex items-center gap-1">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="projectId" value={projectId} />
      <select
        name="priority"
        defaultValue={priority}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded border border-neutral-200 bg-white px-1 py-0.5 text-xs ${PRIORITY_COLOR[priority] ?? ""}`}
      >
        {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </form>
  );
}

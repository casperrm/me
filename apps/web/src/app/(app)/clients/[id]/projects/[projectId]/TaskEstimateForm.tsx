"use client";

import { useState } from "react";
import { setTaskEstimateAction } from "@/lib/actions/task";

export function TaskEstimateForm({
  taskId,
  clientId,
  projectId,
  estimateHours,
}: {
  taskId: string;
  clientId: string;
  projectId: string;
  estimateHours: number | null;
}) {
  const [value, setValue] = useState(estimateHours === null ? "" : String(estimateHours));

  return (
    <form action={setTaskEstimateAction} className="flex items-center gap-1">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input
        type="number"
        name="estimateHours"
        min="0"
        step="0.25"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="hrs"
        className="w-14 rounded border border-neutral-200 bg-white px-1 py-0.5 text-right text-xs"
      />
      <button
        type="submit"
        className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50"
      >
        Set
      </button>
    </form>
  );
}

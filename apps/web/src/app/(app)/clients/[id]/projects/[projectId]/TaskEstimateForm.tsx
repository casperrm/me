"use client";

import { useState, useTransition } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("clientId", clientId);
    formData.set("projectId", projectId);
    formData.set("estimateHours", value);

    startTransition(async () => {
      const result = await setTaskEstimateAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <form onSubmit={handleSubmit} className="flex items-center gap-1">
        <input
          type="number"
          name="estimateHours"
          min="0"
          step="0.25"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isPending}
          placeholder="hrs"
          className="w-14 rounded border border-neutral-200 bg-white px-1 py-0.5 text-right text-xs disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50 disabled:opacity-60"
        >
          Set
        </button>
      </form>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

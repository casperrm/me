"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddExpenseForm({
  clientId,
  projects,
}: {
  clientId: string;
  projects?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          amountCents: Math.round(parseFloat(amount) * 100),
          description: description || undefined,
          clientId,
          projectId: projectId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setCategory("");
      setAmount("");
      setDescription("");
      setProjectId("");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-cedar-700 hover:underline">
        + Log expense
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mb-4 space-y-2 rounded-md border border-neutral-100 p-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (e.g. Contractor)"
          required
          className="min-w-[8rem] flex-1 rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount ($)"
          required
          className="w-28 rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
      />
      {projects && projects.length > 0 && (
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        >
          <option value="">No project (unassigned)</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Log expense"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

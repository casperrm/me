"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddInvoiceForm({
  clientId,
  projects,
}: {
  clientId: string;
  projects?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          projectId: projectId || undefined,
          amountCents: Math.round(parseFloat(amount) * 100),
          dueAt: dueAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setAmount("");
      setDueAt("");
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
        + Create invoice
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mb-4 space-y-2 rounded-md border border-neutral-100 p-3">
      <div className="flex flex-wrap gap-2">
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
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
      </div>
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
          {loading ? "Saving…" : "Create invoice"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

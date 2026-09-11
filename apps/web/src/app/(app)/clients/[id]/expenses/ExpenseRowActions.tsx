"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Expense {
  id: string;
  category: string;
  amountCents: number;
  description: string | null;
  incurredAt: string;
}

export function ExpenseRowActions({ expense }: { expense: Expense }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(expense.category);
  const [amount, setAmount] = useState((expense.amountCents / 100).toString());
  const [description, setDescription] = useState(expense.description ?? "");
  const [incurredAt, setIncurredAt] = useState(expense.incurredAt.slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          amountCents: Math.round(parseFloat(amount) * 100),
          description: description || undefined,
          incurredAt: incurredAt || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <span className="flex gap-2 text-xs">
        <button type="button" onClick={() => setOpen(true)} className="text-cedar-700 hover:underline">
          Edit
        </button>
        <button type="button" onClick={onDelete} disabled={loading} className="text-red-600 hover:underline disabled:opacity-50">
          Delete
        </button>
        {error && <span className="text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <form onSubmit={onSave} className="mt-2 w-full space-y-2 rounded-md border border-neutral-100 p-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
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
        <input
          type="date"
          value={incurredAt}
          onChange={(e) => setIncurredAt(e.target.value)}
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cedar-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-500 hover:underline">
          Cancel
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}

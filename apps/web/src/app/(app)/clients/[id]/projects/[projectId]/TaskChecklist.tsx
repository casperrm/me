"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export function TaskChecklist({ taskId, items, canWrite }: { taskId: string; items: ChecklistItem[]; canWrite: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    try {
      await fetch(`/api/tasks/${taskId}/checklist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setText("");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function toggleItem(itemId: string) {
    setPendingId(itemId);
    try {
      await fetch(`/api/checklist-items/${itemId}/toggle`, { method: "POST" });
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function deleteItem(itemId: string) {
    setPendingId(itemId);
    try {
      await fetch(`/api/checklist-items/${itemId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0 && !canWrite) return null;

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="mt-2 ml-0 space-y-1">
      {items.length > 0 && (
        <>
          <p className="text-xs text-neutral-400">
            Checklist ({doneCount}/{items.length})
          </p>
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={!canWrite || pendingId === item.id}
                  onChange={() => toggleItem(item.id)}
                  className="h-3.5 w-3.5"
                />
                <span className={item.done ? "text-neutral-400 line-through" : ""}>{item.text}</span>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => deleteItem(item.id)}
                    disabled={pendingId === item.id}
                    className="text-xs text-neutral-300 hover:text-red-600"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {canWrite && (
        <form onSubmit={addItem} className="flex items-center gap-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="+ Checklist item"
            className="w-48 rounded border border-neutral-200 px-1.5 py-0.5 text-xs"
          />
          <button type="submit" disabled={adding || !text.trim()} className="text-xs text-cedar-700 hover:underline disabled:opacity-50">
            Add
          </button>
        </form>
      )}
    </div>
  );
}

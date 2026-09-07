"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TaskCommentItem {
  id: string;
  text: string;
  createdAt: string | Date;
  author: { user: { name: string } };
}

export function TaskComments({ taskId, comments, canWrite }: { taskId: string; comments: TaskCommentItem[]; canWrite: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    try {
      await fetch(`/api/tasks/${taskId}/comments`, {
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

  if (comments.length === 0 && !canWrite) return null;

  return (
    <div className="mt-2 ml-0 space-y-1">
      {comments.length > 0 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs text-neutral-400 hover:text-neutral-600">
          {open ? "Hide" : "Show"} comments ({comments.length})
        </button>
      )}
      {open && comments.length > 0 && (
        <ul className="space-y-1 border-l-2 border-neutral-100 pl-2">
          {comments.map((comment) => (
            <li key={comment.id} className="text-xs text-neutral-600">
              <span className="font-medium text-neutral-500">{comment.author.user.name}:</span> {comment.text}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form onSubmit={addComment} className="flex items-center gap-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="+ Comment"
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

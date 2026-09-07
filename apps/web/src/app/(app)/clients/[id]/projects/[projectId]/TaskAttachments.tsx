"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TaskAttachmentUploadForm } from "./TaskAttachmentUploadForm";

interface TaskAttachmentItem {
  id: string;
  filename: string;
  downloadUrl: string;
  uploadedByName: string | null;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskAttachments({
  taskId,
  attachments,
  canWrite,
}: {
  taskId: string;
  attachments: (TaskAttachmentItem & { sizeBytes: number | null })[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function onDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/assets/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  if (attachments.length === 0 && !canWrite) return null;

  return (
    <div className="mt-2 ml-0 space-y-1">
      {attachments.length > 0 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs text-neutral-400 hover:text-neutral-600">
          {open ? "Hide" : "Show"} attachments ({attachments.length})
        </button>
      )}
      {open && attachments.length > 0 && (
        <ul className="space-y-1 border-l-2 border-neutral-100 pl-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-xs">
              <a href={a.downloadUrl} className="text-cedar-700 hover:underline">
                {a.filename}
              </a>
              <span className="flex items-center gap-2 text-neutral-400">
                <span>{formatSize(a.sizeBytes)}</span>
                {a.uploadedByName && <span>· {a.uploadedByName}</span>}
                {canWrite && (
                  <button
                    onClick={() => onDelete(a.id)}
                    disabled={deletingId === a.id}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    {deletingId === a.id ? "Removing…" : "Remove"}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canWrite && <TaskAttachmentUploadForm taskId={taskId} />}
    </div>
  );
}

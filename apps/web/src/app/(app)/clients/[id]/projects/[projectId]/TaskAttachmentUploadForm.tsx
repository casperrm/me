"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function TaskAttachmentUploadForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"
        className="w-40 text-xs"
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
      >
        {loading ? "Uploading…" : "Attach"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

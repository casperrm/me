"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AssetUploadForm({ clientId }: { clientId: string }) {
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
      const res = await fetch(`/api/clients/${clientId}/assets`, { method: "POST", body: formData });
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
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf" className="text-xs" />
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-cedar-600 px-3 py-1 text-xs font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
      >
        {loading ? "Uploading…" : "Upload"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

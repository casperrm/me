"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface AssetRow {
  id: string;
  filename: string;
  sizeBytes: number | null;
  downloadUrl: string;
  uploadedByName: string | null;
  createdAt: string;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetsList({ assets, canWrite }: { assets: AssetRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not remove this file.");
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ul className="space-y-2 text-sm">
        {assets.map((asset) => (
          <li key={asset.id} className="flex items-center justify-between">
            <a href={asset.downloadUrl} className="text-cedar-700 hover:underline">
              {asset.filename}
            </a>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span>{formatSize(asset.sizeBytes)}</span>
              {asset.uploadedByName && <span>· {asset.uploadedByName}</span>}
              {canWrite && (
                <button
                  onClick={() => onDelete(asset.id)}
                  disabled={deletingId === asset.id}
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  {deletingId === asset.id ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

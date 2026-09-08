"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TemplateDeleteButton({ templateId, templateName }: { templateId: string; templateName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (!confirm(`Delete the template "${templateName}"? This can't be undone.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/project-templates/${templateId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={onDelete} disabled={loading} className="text-xs text-red-600 hover:underline disabled:opacity-50">
      {loading ? "Deleting…" : "Delete"}
    </button>
  );
}

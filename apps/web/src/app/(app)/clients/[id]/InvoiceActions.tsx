"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InvoiceActions({ invoiceId, status }: { invoiceId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/${path}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (status === "DRAFT") {
    return (
      <div className="flex items-center gap-2">
        <button disabled={loading} onClick={() => act("send")} className="text-xs text-cedar-700 hover:underline disabled:opacity-50">
          Send
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    );
  }

  if (status === "SENT") {
    return (
      <div className="flex items-center gap-2">
        <button disabled={loading} onClick={() => act("mark-paid")} className="text-xs text-cedar-700 hover:underline disabled:opacity-50">
          Mark paid
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    );
  }

  return null;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RevokeConnectionButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function revoke() {
    if (!confirm("Revoke this connection? Any external tool still calling its webhook URL will start being rejected.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/connections/${connectionId}/revoke`, { method: "POST" });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={revoke} disabled={loading} className="text-xs text-red-600 hover:underline disabled:opacity-50">
      {loading ? "Revoking…" : "Revoke"}
    </button>
  );
}

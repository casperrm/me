"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DisableMfaForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
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

  return (
    <div>
      <p className="mb-3 text-sm text-cedar-700">Two-factor authentication is enabled on your account.</p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-sm text-red-600 hover:underline">
          Disable two-factor authentication
        </button>
      ) : (
        <form onSubmit={onSubmit} className="space-y-2">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Confirm your password to disable</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-64 rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Disabling…" : "Disable"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 hover:underline">
              Cancel
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}

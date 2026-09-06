"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateConnectionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ webhookUrl: string; signingSecret: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setCreated({
        webhookUrl: `${window.location.origin}/api/integrations/webhooks/${data.connectionId}`,
        signingSecret: data.signingSecret,
      });
      setName("");
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    return (
      <div className="mb-4 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
        <p className="font-medium text-amber-800">Save this now — the signing secret is shown only once.</p>
        <div>
          <div className="text-xs text-neutral-500">Webhook URL</div>
          <code className="block break-all rounded bg-white px-2 py-1 text-xs">{created.webhookUrl}</code>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Signing secret</div>
          <code className="block break-all rounded bg-white px-2 py-1 text-xs">{created.signingSecret}</code>
        </div>
        <p className="text-xs text-neutral-500">
          Sign each request body with HMAC-SHA256 using this secret and send it as the{" "}
          <code>X-Cedar-Signature</code> header (hex-encoded).
        </p>
        <button
          onClick={() => {
            setCreated(null);
            setOpen(false);
            router.refresh();
          }}
          className="text-xs text-cedar-700 hover:underline"
        >
          Done
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-cedar-700 hover:underline">
        + Add generic webhook
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mb-4 space-y-2 rounded-md border border-neutral-100 p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Zapier — lead form)"
        required
        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create connection"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

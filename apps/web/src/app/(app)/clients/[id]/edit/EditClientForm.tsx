"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LIFECYCLE_STAGES = ["PROSPECT", "ACTIVE", "PAUSED", "CHURNED"] as const;

interface Initial {
  name: string;
  companyName: string;
  industry: string;
  lifecycleStage: string;
  primaryContactName: string;
  primaryContactEmail: string;
}

export function EditClientForm({ clientId, initial }: { clientId: string; initial: Initial }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [industry, setIndustry] = useState(initial.industry);
  const [lifecycleStage, setLifecycleStage] = useState(initial.lifecycleStage);
  const [primaryContactName, setPrimaryContactName] = useState(initial.primaryContactName);
  const [primaryContactEmail, setPrimaryContactEmail] = useState(initial.primaryContactEmail);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          companyName,
          industry: industry || undefined,
          lifecycleStage,
          primaryContactName: primaryContactName || undefined,
          primaryContactEmail: primaryContactEmail || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      router.push(`/clients/${clientId}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-neutral-600">Client name *</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Company name *</label>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
          className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Industry</label>
        <input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Lifecycle stage</label>
        <select
          value={lifecycleStage}
          onChange={(e) => setLifecycleStage(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
        >
          {LIFECYCLE_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Primary contact name</label>
        <input
          value={primaryContactName}
          onChange={(e) => setPrimaryContactName(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Primary contact email</label>
        <input
          type="email"
          value={primaryContactEmail}
          onChange={(e) => setPrimaryContactEmail(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading || !name || !companyName}
        className="rounded-md bg-cedar-600 px-4 py-2 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

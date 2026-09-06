"use client";

import { useState } from "react";
import { Card } from "@/components/Card";

type PlanItem = { agent: string; output: string | null };
type BrainResult = {
  agents: string[];
  mode: "stub" | "live";
  summary: string;
  plan: PlanItem[];
};

export default function CommandCenterPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BrainResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/cedar-brain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cedar Command Center</h1>
        <p className="text-sm text-neutral-500">
          One place to talk to Cedar Point OS in plain language (Section 32). Requests are routed
          to the relevant Cedar Brain agents and logged to Agency Memory.
        </p>
      </div>

      <Card>
        <textarea
          className="w-full resize-none rounded-md border border-neutral-200 p-3 text-sm focus:border-cedar-400 focus:outline-none"
          rows={4}
          placeholder="e.g. Create a complete launch campaign for Client X's new fast charger."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={submit}
            disabled={loading}
            className="rounded-md bg-cedar-600 px-4 py-2 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
          >
            {loading ? "Routing…" : "Send to Cedar Brain"}
          </button>
        </div>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}

      {result && (
        <Card title={`Routed to: ${result.agents.join(", ")}`}>
          {result.mode === "stub" && (
            <p className="mb-3 text-xs text-amber-600">
              Running in stub mode — set ANTHROPIC_API_KEY for a real drafted response.
            </p>
          )}
          <p className="whitespace-pre-wrap text-sm">{result.summary}</p>
        </Card>
      )}
    </div>
  );
}

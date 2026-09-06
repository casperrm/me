"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";

interface ColorRow {
  name: string;
  hex: string;
}
interface FontRow {
  role: string;
  family: string;
}
interface PatternRow {
  pattern: string;
  rationale: string;
}

interface FormState {
  colors: ColorRow[];
  fonts: FontRow[];
  toneOfVoice: string;
  visualStyle: string;
  targetAudience: string;
  products: string[];
  approvedPatterns: PatternRow[];
  rejectedPatterns: PatternRow[];
}

export function BrandDnaForm({ clientId, initial }: { clientId: string; initial: FormState }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [productsText, setProductsText] = useState(initial.products.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/brand`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          products: productsText.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push(`/clients/${clientId}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card title="Colors">
        {form.colors.map((c, i) => (
          <div key={i} className="mb-2 flex items-center gap-2">
            <input
              value={c.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, colors: f.colors.map((r, ri) => (ri === i ? { ...r, name: e.target.value } : r)) }))
              }
              placeholder="Name"
              className="flex-1 rounded-md border border-neutral-200 px-2 py-1 text-sm"
            />
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : "#000000"}
              onChange={(e) =>
                setForm((f) => ({ ...f, colors: f.colors.map((r, ri) => (ri === i ? { ...r, hex: e.target.value } : r)) }))
              }
              className="h-8 w-10 rounded border border-neutral-200"
            />
            <input
              value={c.hex}
              onChange={(e) =>
                setForm((f) => ({ ...f, colors: f.colors.map((r, ri) => (ri === i ? { ...r, hex: e.target.value } : r)) }))
              }
              placeholder="#RRGGBB"
              className="w-24 rounded-md border border-neutral-200 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, colors: f.colors.filter((_, ri) => ri !== i) }))}
              className="text-xs text-red-600"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, colors: [...f.colors, { name: "", hex: "#000000" }] }))}
          className="text-xs text-cedar-700 hover:underline"
        >
          + Add color
        </button>
      </Card>

      <Card title="Fonts">
        {form.fonts.map((fnt, i) => (
          <div key={i} className="mb-2 flex items-center gap-2">
            <input
              value={fnt.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, fonts: f.fonts.map((r, ri) => (ri === i ? { ...r, role: e.target.value } : r)) }))
              }
              placeholder="Role (e.g. Heading)"
              className="w-1/3 rounded-md border border-neutral-200 px-2 py-1 text-sm"
            />
            <input
              value={fnt.family}
              onChange={(e) =>
                setForm((f) => ({ ...f, fonts: f.fonts.map((r, ri) => (ri === i ? { ...r, family: e.target.value } : r)) }))
              }
              placeholder="Family (e.g. Poppins)"
              className="flex-1 rounded-md border border-neutral-200 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, fonts: f.fonts.filter((_, ri) => ri !== i) }))}
              className="text-xs text-red-600"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, fonts: [...f.fonts, { role: "", family: "" }] }))}
          className="text-xs text-cedar-700 hover:underline"
        >
          + Add font
        </button>
      </Card>

      <Card title="Voice &amp; audience">
        <label className="mb-1 block text-xs font-medium text-neutral-600">Tone of voice</label>
        <textarea
          value={form.toneOfVoice}
          onChange={(e) => setForm((f) => ({ ...f, toneOfVoice: e.target.value }))}
          rows={2}
          className="mb-3 w-full rounded-md border border-neutral-200 px-2 py-1 text-sm"
        />
        <label className="mb-1 block text-xs font-medium text-neutral-600">Visual style</label>
        <textarea
          value={form.visualStyle}
          onChange={(e) => setForm((f) => ({ ...f, visualStyle: e.target.value }))}
          rows={2}
          className="mb-3 w-full rounded-md border border-neutral-200 px-2 py-1 text-sm"
        />
        <label className="mb-1 block text-xs font-medium text-neutral-600">Target audience</label>
        <textarea
          value={form.targetAudience}
          onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))}
          rows={2}
          className="mb-3 w-full rounded-md border border-neutral-200 px-2 py-1 text-sm"
        />
        <label className="mb-1 block text-xs font-medium text-neutral-600">Products (one per line)</label>
        <textarea
          value={productsText}
          onChange={(e) => setProductsText(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-neutral-200 px-2 py-1 text-sm"
        />
      </Card>

      {(["approvedPatterns", "rejectedPatterns"] as const).map((key) => (
        <Card key={key} title={key === "approvedPatterns" ? "Approved creative patterns" : "Rejected creative patterns"}>
          {form[key].map((p, i) => (
            <div key={i} className="mb-2 flex items-center gap-2">
              <input
                value={p.pattern}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [key]: f[key].map((r, ri) => (ri === i ? { ...r, pattern: e.target.value } : r)) }))
                }
                placeholder="Pattern"
                className="w-1/3 rounded-md border border-neutral-200 px-2 py-1 text-sm"
              />
              <input
                value={p.rationale}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [key]: f[key].map((r, ri) => (ri === i ? { ...r, rationale: e.target.value } : r)) }))
                }
                placeholder="Rationale"
                className="flex-1 rounded-md border border-neutral-200 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, [key]: f[key].filter((_, ri) => ri !== i) }))}
                className="text-xs text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, [key]: [...f[key], { pattern: "", rationale: "" }] }))}
            className="text-xs text-cedar-700 hover:underline"
          >
            + Add
          </button>
        </Card>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cedar-600 px-4 py-2 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save new version"}
        </button>
      </div>
    </form>
  );
}

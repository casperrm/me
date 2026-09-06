"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface VideoBriefValues {
  concept: string;
  hook: string;
  storyboardNotes: string;
  script: string;
  voiceoverCopy: string;
  captionCopy: string;
  editInstructions: string;
  musicNotes: string;
  platformVariants: string[];
}

const FIELDS: { key: keyof Omit<VideoBriefValues, "platformVariants">; label: string; rows?: number }[] = [
  { key: "concept", label: "Concept" },
  { key: "hook", label: "Hook" },
  { key: "storyboardNotes", label: "Storyboard notes", rows: 3 },
  { key: "script", label: "Script", rows: 4 },
  { key: "voiceoverCopy", label: "Voice-over copy", rows: 3 },
  { key: "captionCopy", label: "Subtitle / caption copy", rows: 3 },
  { key: "editInstructions", label: "Edit instructions", rows: 3 },
  { key: "musicNotes", label: "Music / asset notes" },
];

export function VideoBriefForm({ creativeId, initial, currentVersion }: { creativeId: string; initial: VideoBriefValues; currentVersion: number }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [platformVariantsText, setPlatformVariantsText] = useState(initial.platformVariants.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  function setField(key: keyof Omit<VideoBriefValues, "platformVariants">, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/creatives/${creativeId}/video-brief`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          platformVariants: platformVariantsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-neutral-400">
        Saving creates version {currentVersion + 1} — past versions are never overwritten (Section 11.1).
      </p>
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label className="mb-1 block text-xs font-medium text-neutral-600">{f.label}</label>
          {f.rows ? (
            <textarea
              value={values[f.key]}
              onChange={(e) => setField(f.key, e.target.value)}
              rows={f.rows}
              className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
            />
          ) : (
            <input
              value={values[f.key]}
              onChange={(e) => setField(f.key, e.target.value)}
              className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
            />
          )}
        </div>
      ))}
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Platform variants (comma-separated, e.g. 9:16, 1:1, 16:9)</label>
        <input
          value={platformVariantsText}
          onChange={(e) => {
            setPlatformVariantsText(e.target.value);
            setSaved(false);
          }}
          className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save new version"}
        </button>
        {saved && <span className="text-sm text-cedar-700">Saved.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

export interface AssetOption {
  id: string;
  filename: string;
}

// Search-as-you-type instead of loading a client's entire file history
// into a <select> (Phase 7 scale hardening's last audit item; see
// docs/specs/asset-picker-search.md). A blank query shows the most
// recent files — a real, useful starting point, not an empty box.
const DEBOUNCE_MS = 250;

export function AssetPicker({
  clientId,
  value,
  onChange,
}: {
  clientId: string;
  value: AssetOption | null;
  onChange: (asset: AssetOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AssetOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/clients/${clientId}/assets/search?q=${encodeURIComponent(query)}`)
        .then((res) => (res.ok ? res.json() : { assets: [] }))
        .then((data) => setResults(data.assets ?? []))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, clientId]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-neutral-200 px-2 py-1.5 text-sm">
        <span className="truncate">{value.filename}</span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
          className="shrink-0 text-xs text-neutral-400 hover:text-neutral-600"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search files to link…"
        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-sm">
          {loading ? (
            <div className="px-2 py-1.5 text-xs text-neutral-400">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-neutral-400">
              {query ? "No matching files." : "No files yet."}
            </div>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(r);
                      setOpen(false);
                    }}
                    className="block w-full truncate px-2 py-1.5 text-left text-sm hover:bg-neutral-50"
                  >
                    {r.filename}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

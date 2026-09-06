"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  type: "client" | "project" | "campaign" | "creative" | "content" | "shoot";
  id: string;
  title: string;
  subtitle: string;
  url: string;
}

const TYPE_LABEL: Record<string, string> = {
  client: "Client",
  project: "Project",
  campaign: "Campaign",
  creative: "Creative",
  content: "Content",
  shoot: "Shoot",
};

// Bible Section 28.2: "Global search/command palette can find records and
// initiate permitted actions." This is the "find records" half — jumping
// to a result by keyboard is the only "action" it initiates. Running a
// command against a record belongs with Cedar Command Center, not here
// (see docs/specs/search.md).
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setActiveIndex(0);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  function go(result: SearchResult) {
    close();
    router.push(result.url);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      go(results[activeIndex]);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-50"
      >
        <span>Search…</span>
        <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24" onClick={close}>
          <div
            className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search clients, projects, campaigns, creative…"
              className="w-full border-b border-neutral-100 px-4 py-3 text-sm outline-none"
            />
            <div className="max-h-80 overflow-y-auto">
              {loading && <p className="px-4 py-3 text-sm text-neutral-400">Searching…</p>}
              {!loading && query.trim().length >= 2 && results.length === 0 && (
                <p className="px-4 py-3 text-sm text-neutral-400">No matches.</p>
              )}
              {!loading &&
                results.map((r, i) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => go(r)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                      i === activeIndex ? "bg-cedar-50" : ""
                    }`}
                  >
                    <span>
                      <span className="font-medium text-neutral-800">{r.title}</span>
                      <span className="ml-2 text-xs text-neutral-400">{r.subtitle}</span>
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">{TYPE_LABEL[r.type]}</span>
                  </button>
                ))}
            </div>
            <div className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-400">
              <kbd className="rounded bg-neutral-100 px-1">↑↓</kbd> navigate <kbd className="ml-2 rounded bg-neutral-100 px-1">↵</kbd> open{" "}
              <kbd className="ml-2 rounded bg-neutral-100 px-1">esc</kbd> close
            </div>
          </div>
        </div>
      )}
    </>
  );
}

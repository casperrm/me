"use client";

import { useEffect, useRef, useState } from "react";

type Client = { id: string; name: string };
type ChatMsg = { id: string; role: "user" | "assistant"; content: string };
type MemoryNote = { id: string; title: string; content: string; tags: string; source: string; sourceUrl: string | null; createdAt: string };

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "report", label: "Client Reports" },
  { id: "ads", label: "Ad Creative" },
  { id: "memory", label: "Memory" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function BrainPage() {
  const [tab, setTab] = useState<Tab>("chat");
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cedar-900">Cedar Point Brain</h1>
        <p className="text-cedar-500">Your AI teammate - it remembers what you teach it and gets sharper over time.</p>
      </div>

      <div className="flex gap-1 border-b border-cedar-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-cedar-700 text-cedar-900" : "border-transparent text-cedar-400 hover:text-cedar-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "chat" && <ChatPanel />}
      {tab === "report" && <ReportPanel clients={clients} />}
      {tab === "ads" && <AdsPanel clients={clients} />}
      {tab === "memory" && <MemoryPanel />}
    </div>
  );
}

function ChatPanel() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch("/api/brain/chat");
    if (res.ok) setMessages(await res.json());
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input;
    setInput("");
    setMessages((m) => [...m, { id: "temp-user", role: "user", content: text }]);
    setSending(true);
    const res = await fetch("/api/brain/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    setSending(false);
    await load();
    if (!res.ok) alert(data.error || "Something went wrong.");
  }

  async function saveAsMemory(content: string, id: string) {
    const title = prompt("Give this memory a short title:", content.slice(0, 40));
    if (!title) return;
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, tags: "chat", source: "chat" }),
    });
    setSavedIds((s) => new Set(s).add(id));
  }

  return (
    <div className="card flex flex-col h-[65vh]">
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-cedar-400">
            Ask me to brainstorm content, draft a message to a client, help you think through an ad, or just talk through your day.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
              m.role === "user" ? "bg-cedar-700 text-white" : "bg-cedar-50 text-cedar-900"
            }`}>
              {m.content}
              {m.role === "assistant" && (
                <div className="mt-2">
                  <button
                    className="text-xs text-cedar-500 hover:underline disabled:opacity-50"
                    disabled={savedIds.has(m.id)}
                    onClick={() => saveAsMemory(m.content, m.id)}
                  >
                    {savedIds.has(m.id) ? "Saved to memory" : "💾 Save as memory"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <div className="text-sm text-cedar-400">Thinking...</div>}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="border-t border-cedar-100 p-3 flex gap-2">
        <input
          className="input"
          placeholder="Message the Brain..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn-primary" disabled={sending}>Send</button>
      </form>
    </div>
  );
}

function ReportPanel({ clients }: { clients: Client[] }) {
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  async function generate() {
    if (!clientId) return;
    setLoading(true);
    setReport(null);
    const res = await fetch("/api/brain/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const data = await res.json();
    setLoading(false);
    setReport(data.report);
  }

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm text-cedar-600">Draft a partner-support performance update using their real posts, campaigns, and invoices.</p>
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="label">Partner</label>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select...</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn-primary" disabled={!clientId || loading} onClick={generate}>
          {loading ? "Drafting..." : "Draft report"}
        </button>
      </div>
      {report && (
        <div className="bg-cedar-50 rounded-lg p-4 text-sm whitespace-pre-wrap">{report}</div>
      )}
    </div>
  );
}

function AdsPanel({ clients }: { clients: Client[] }) {
  const [form, setForm] = useState({ clientId: "", product: "", platform: "instagram", goal: "", audience: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/brain/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    setResult(data.result);
  }

  return (
    <div className="card p-5 space-y-4">
      <p className="text-sm text-cedar-600">Get ad copy and a creative brief in seconds so you can move straight into design.</p>
      <form onSubmit={generate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Partner (optional)</label>
          <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="">None</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Platform</label>
          <select className="input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
            {["instagram", "tiktok", "facebook", "x", "linkedin", "google", "youtube"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Product / offer</label>
          <input className="input" required value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="e.g. 20% off first order this weekend" />
        </div>
        <div>
          <label className="label">Goal</label>
          <input className="input" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="e.g. drive online orders" />
        </div>
        <div>
          <label className="label">Audience</label>
          <input className="input" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="e.g. local moms 25-40" />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <button className="btn-primary" disabled={loading}>{loading ? "Working..." : "Generate ad kit"}</button>
        </div>
      </form>
      {result && <div className="bg-cedar-50 rounded-lg p-4 text-sm whitespace-pre-wrap">{result}</div>}
    </div>
  );
}

function MemoryPanel() {
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [form, setForm] = useState({ title: "", content: "", tags: "" });
  const [url, setUrl] = useState("");
  const [learning, setLearning] = useState(false);
  const [learnError, setLearnError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/memory");
    if (res.ok) setNotes(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.content) return;
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ title: "", content: "", tags: "" });
    load();
  }

  async function learnFromUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setLearning(true);
    setLearnError(null);
    const res = await fetch("/api/memory/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    setLearning(false);
    if (!res.ok) { setLearnError(data.error); return; }
    setUrl("");
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/memory/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-cedar-900">Learn from a link</h2>
        <p className="text-sm text-cedar-500">Paste an article about marketing, design, or platform trends - the Brain reads it and saves the key takeaways to memory for future use.</p>
        <form onSubmit={learnFromUrl} className="flex gap-2">
          <input className="input" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn-primary shrink-0" disabled={learning}>{learning ? "Reading..." : "Learn"}</button>
        </form>
        {learnError && <p className="text-sm text-red-600">{learnError}</p>}
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-cedar-900">Add a memory manually</h2>
        <form onSubmit={addNote} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder="Tags (comma separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          <textarea className="input sm:col-span-2" rows={2} placeholder="What should the Brain remember?" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          <div className="sm:col-span-2 flex justify-end">
            <button className="btn-primary">Save memory</button>
          </div>
        </form>
      </div>

      <div className="card divide-y divide-cedar-100">
        <div className="px-5 py-3 font-semibold text-cedar-900">Everything the Brain remembers ({notes.length})</div>
        {notes.length === 0 && <div className="px-5 py-4 text-sm text-cedar-400">Nothing saved yet.</div>}
        {notes.map((n) => (
          <div key={n.id} className="px-5 py-3 flex items-start justify-between gap-3">
            <div>
              <div className="font-medium text-cedar-900 text-sm">{n.title}</div>
              <div className="text-sm text-cedar-600">{n.content}</div>
              <div className="text-xs text-cedar-400 mt-1">
                {n.source}{n.sourceUrl ? ` - ${n.sourceUrl}` : ""} - {new Date(n.createdAt).toLocaleDateString()}
              </div>
            </div>
            <button className="text-cedar-400 hover:text-red-600 text-xs shrink-0" onClick={() => remove(n.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

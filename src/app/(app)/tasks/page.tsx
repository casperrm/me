"use client";

import { useEffect, useState } from "react";

type Client = { id: string; name: string };
type Task = {
  id: string; title: string; notes: string | null; priority: string; status: string;
  dueDate: string | null; client: Client | null;
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-50 text-red-600",
  medium: "bg-amber-50 text-amber-600",
  low: "bg-cedar-100 text-cedar-600",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", clientId: "", priority: "medium", dueDate: "" });
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiReasons, setAiReasons] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState(false);

  async function load() {
    const [t, c] = await Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ]);
    setTasks(t);
    setClients(c);
  }

  useEffect(() => { load(); }, []);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({ title: "", notes: "", clientId: "", priority: "medium", dueDate: "" });
    load();
  }

  async function toggleDone(task: Task) {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: task.status === "open" ? "done" : "open" }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    load();
  }

  async function prioritize() {
    setLoadingAi(true);
    setAiSummary(null);
    const res = await fetch("/api/brain/priority", { method: "POST" });
    const data = await res.json();
    setLoadingAi(false);
    setAiSummary(data.summary);
    setAiReasons(data.reasons || {});
    load();
  }

  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cedar-900">Tasks</h1>
          <p className="text-cedar-500">Everything on your plate, agency-wide.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={prioritize} disabled={loadingAi || open.length === 0}>
            {loadingAi ? "Thinking..." : "✨ Ask Brain to prioritize"}
          </button>
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "+ Add task"}</button>
        </div>
      </div>

      {aiSummary && (
        <div className="card p-4 bg-cedar-50 border-cedar-200 text-sm text-cedar-700">{aiSummary}</div>
      )}

      {showForm && (
        <form onSubmit={createTask} className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Task</label>
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Related partner (optional)</label>
            <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">None</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="label">Due date (optional)</label>
            <input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button className="btn-primary">Save task</button>
          </div>
        </form>
      )}

      <div className="card divide-y divide-cedar-100">
        <div className="px-5 py-3 font-semibold text-cedar-900">Open ({open.length})</div>
        {open.length === 0 && <div className="px-5 py-4 text-sm text-cedar-400">Nothing open - nice work.</div>}
        {open.map((t) => (
          <div key={t.id} className="px-5 py-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" checked={false} onChange={() => toggleDone(t)} />
              <div>
                <div className="font-medium text-cedar-900 text-sm">{t.title}</div>
                {t.client && <div className="text-xs text-cedar-500">{t.client.name}</div>}
                {t.notes && <div className="text-xs text-cedar-400">{t.notes}</div>}
                {aiReasons[t.id] && <div className="text-xs text-cedar-600 italic mt-1">Brain: {aiReasons[t.id]}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {t.dueDate && <span className="text-xs text-cedar-400">{new Date(t.dueDate).toLocaleDateString()}</span>}
              <span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span>
              <button className="text-cedar-400 hover:text-red-600 text-xs" onClick={() => remove(t.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <div className="card divide-y divide-cedar-100 opacity-70">
          <div className="px-5 py-3 font-semibold text-cedar-900">Done ({done.length})</div>
          {done.map((t) => (
            <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked onChange={() => toggleDone(t)} />
                <span className="text-sm line-through text-cedar-500">{t.title}</span>
              </div>
              <button className="text-cedar-400 hover:text-red-600 text-xs" onClick={() => remove(t.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

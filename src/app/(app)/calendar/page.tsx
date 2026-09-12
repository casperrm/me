"use client";

import { useEffect, useMemo, useState } from "react";

type Client = { id: string; name: string; niche: string | null };
type Post = {
  id: string;
  clientId: string;
  platform: string;
  caption: string;
  status: string;
  date: string;
  aiGenerated: boolean;
  client: Client;
};

const PLATFORMS = ["instagram", "tiktok", "facebook", "x", "linkedin", "youtube"];
const STATUS_COLORS: Record<string, string> = {
  idea: "bg-cedar-100 text-cedar-600",
  drafted: "bg-amber-50 text-amber-700",
  scheduled: "bg-blue-50 text-blue-700",
  posted: "bg-green-50 text-green-700",
};

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function daysInMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

export default function CalendarPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientId: "", platform: "instagram", caption: "", date: "", status: "idea" });

  const [ideaClientId, setIdeaClientId] = useState("");
  const [ideaPlatform, setIdeaPlatform] = useState("instagram");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [ideasMsg, setIdeasMsg] = useState<string | null>(null);
  const [loadingIdeas, setLoadingIdeas] = useState(false);

  async function load() {
    const [c, p] = await Promise.all([fetch("/api/clients").then((r) => r.json()), fetch("/api/posts").then((r) => r.json())]);
    setClients(c);
    setPosts(p);
  }

  useEffect(() => { load(); }, []);

  const grid = useMemo(() => {
    const first = startOfMonth(month);
    const startWeekday = first.getDay();
    const total = daysInMonth(month);
    const cells: (Date | null)[] = Array(startWeekday).fill(null);
    for (let d = 1; d <= total; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  function postsOn(date: Date) {
    return posts.filter((p) => {
      const pd = new Date(p.date);
      return pd.getFullYear() === date.getFullYear() && pd.getMonth() === date.getMonth() && pd.getDate() === date.getDate();
    });
  }

  async function createPost(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientId || !form.date) return;
    await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({ clientId: "", platform: "instagram", caption: "", date: "", status: "idea" });
    load();
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function deletePost(id: string) {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    load();
  }

  async function generateIdeas() {
    if (!ideaClientId) return;
    setLoadingIdeas(true);
    setIdeasMsg(null);
    const res = await fetch("/api/brain/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: ideaClientId, platform: ideaPlatform, count: 5 }),
    });
    const data = await res.json();
    setLoadingIdeas(false);
    if (data.message) setIdeasMsg(data.message);
    setIdeas(data.ideas || []);
  }

  async function addIdeaToCalendar(caption: string) {
    const date = prompt("Schedule this idea for which date? (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!date) return;
    await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: ideaClientId, platform: ideaPlatform, caption, date, status: "idea", aiGenerated: true }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cedar-900">Content Calendar</h1>
          <p className="text-cedar-500">Plan and schedule every partner's posts.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "+ Add post"}</button>
      </div>

      {showForm && (
        <form onSubmit={createPost} className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Partner</label>
            <select className="input" required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">Select...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Platform</label>
            <select className="input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Caption / idea</label>
            <textarea className="input" required rows={2} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="idea">Idea</option>
              <option value="drafted">Drafted</option>
              <option value="scheduled">Scheduled</option>
              <option value="posted">Posted</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button className="btn-primary">Save post</button>
          </div>
        </form>
      )}

      <div className="card p-5">
        <h2 className="font-semibold text-cedar-900 mb-3">✨ Generate ideas with the Cedar Point Brain</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Partner</label>
            <select className="input" value={ideaClientId} onChange={(e) => setIdeaClientId(e.target.value)}>
              <option value="">Select...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Platform</label>
            <select className="input" value={ideaPlatform} onChange={(e) => setIdeaPlatform(e.target.value)}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button className="btn-secondary" disabled={!ideaClientId || loadingIdeas} onClick={generateIdeas}>
            {loadingIdeas ? "Thinking..." : "Generate 5 ideas"}
          </button>
        </div>
        {ideasMsg && <p className="text-sm text-amber-600 mt-3">{ideasMsg}</p>}
        {ideas.length > 0 && (
          <ul className="mt-4 space-y-2">
            {ideas.map((idea, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-sm bg-cedar-50 rounded-lg px-3 py-2">
                <span>{idea}</span>
                <button className="btn-secondary shrink-0 !px-2 !py-1 text-xs" onClick={() => addIdeaToCalendar(idea)}>+ Add</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <button className="btn-secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>&larr;</button>
          <h2 className="font-semibold text-cedar-900">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
          <button className="btn-secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>&rarr;</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-xs">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center font-semibold text-cedar-500 py-1">{d}</div>
          ))}
          {grid.map((date, i) => (
            <div key={i} className="min-h-[90px] rounded-lg border border-cedar-100 p-1">
              {date && (
                <>
                  <div className="text-cedar-400 text-right pr-1">{date.getDate()}</div>
                  <div className="space-y-1">
                    {postsOn(date).map((p) => (
                      <div key={p.id} className="group relative">
                        <select
                          value={p.status}
                          onChange={(e) => updateStatus(p.id, e.target.value)}
                          className={`w-full truncate rounded px-1 py-0.5 text-[10px] border-0 ${STATUS_COLORS[p.status]}`}
                          title={`${p.client.name}: ${p.caption}`}
                        >
                          <option value="idea">idea</option>
                          <option value="drafted">drafted</option>
                          <option value="scheduled">scheduled</option>
                          <option value="posted">posted</option>
                        </select>
                        <div className="text-[10px] text-cedar-500 truncate">{p.client.name}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card divide-y divide-cedar-100">
        <div className="px-5 py-3 font-semibold text-cedar-900">All posts</div>
        {posts.length === 0 && <div className="px-5 py-4 text-sm text-cedar-400">No posts yet.</div>}
        {posts.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
            <div>
              <div className="font-medium text-cedar-800">{p.client.name} - {p.caption}</div>
              <div className="text-cedar-500 text-xs">{p.platform} - {new Date(p.date).toLocaleDateString()} {p.aiGenerated && "- AI generated"}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${STATUS_COLORS[p.status]}`}>{p.status}</span>
              <button className="text-cedar-400 hover:text-red-600 text-xs" onClick={() => deletePost(p.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

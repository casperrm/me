"use client";

import { useEffect, useState } from "react";

type Client = { id: string; name: string };
type Campaign = {
  id: string;
  name: string;
  platform: string;
  status: string;
  budget: number;
  spend: number;
  reach: number;
  engagement: number;
  conversions: number;
  startDate: string;
  client: Client;
};

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-cedar-100 text-cedar-600",
  active: "bg-green-50 text-green-700",
  paused: "bg-amber-50 text-amber-700",
  completed: "bg-blue-50 text-blue-700",
};

export default function CampaignsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    clientId: "", name: "", platform: "instagram", goal: "", budget: "", spend: "",
    reach: "", engagement: "", conversions: "", status: "planned", startDate: "",
  });

  async function load() {
    const [c, campaignData] = await Promise.all([
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/campaigns").then((r) => r.json()),
    ]);
    setClients(c);
    setCampaigns(campaignData);
  }

  useEffect(() => { load(); }, []);

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({ clientId: "", name: "", platform: "instagram", goal: "", budget: "", spend: "", reach: "", engagement: "", conversions: "", status: "planned", startDate: "" });
    load();
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this campaign?")) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cedar-900">Boost Campaigns</h1>
          <p className="text-cedar-500">Track every growth push and its results.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "+ Add campaign"}</button>
      </div>

      {showForm && (
        <form onSubmit={createCampaign} className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Partner</label>
            <select className="input" required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">Select...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Campaign name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Platform</label>
            <select className="input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              {["instagram", "tiktok", "facebook", "x", "linkedin", "youtube", "google"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="label">Goal</label>
            <input className="input" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="e.g. drive 200 site visits" />
          </div>
          <div>
            <label className="label">Budget ($)</label>
            <input className="input" type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          </div>
          <div>
            <label className="label">Spend so far ($)</label>
            <input className="input" type="number" value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="label">Reach</label>
            <input className="input" type="number" value={form.reach} onChange={(e) => setForm({ ...form, reach: e.target.value })} />
          </div>
          <div>
            <label className="label">Engagement</label>
            <input className="input" type="number" value={form.engagement} onChange={(e) => setForm({ ...form, engagement: e.target.value })} />
          </div>
          <div>
            <label className="label">Conversions</label>
            <input className="input" type="number" value={form.conversions} onChange={(e) => setForm({ ...form, conversions: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Start date</label>
            <input className="input" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <button className="btn-primary">Save campaign</button>
          </div>
        </form>
      )}

      <div className="card divide-y divide-cedar-100">
        {campaigns.length === 0 && <div className="px-5 py-4 text-sm text-cedar-400">No campaigns yet.</div>}
        {campaigns.map((c) => (
          <div key={c.id} className="px-5 py-4 flex items-center justify-between text-sm">
            <div>
              <div className="font-medium text-cedar-900">{c.name} <span className="text-cedar-400 font-normal">- {c.client.name}</span></div>
              <div className="text-cedar-500 text-xs mt-0.5">
                {c.platform} - ${c.spend.toLocaleString()} / ${c.budget.toLocaleString()} spent - {c.reach.toLocaleString()} reach - {c.engagement.toLocaleString()} engagement - {c.conversions.toLocaleString()} conversions
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select value={c.status} onChange={(e) => updateStatus(c.id, e.target.value)} className={`badge border-0 ${STATUS_COLORS[c.status]}`}>
                <option value="planned">planned</option>
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="completed">completed</option>
              </select>
              <button className="text-cedar-400 hover:text-red-600 text-xs" onClick={() => remove(c.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

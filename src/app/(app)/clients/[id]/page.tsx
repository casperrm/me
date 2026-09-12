"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type ClientDetail = {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  niche: string | null;
  status: string;
  notes: string | null;
  posts: { id: string; caption: string; platform: string; status: string; date: string }[];
  campaigns: { id: string; name: string; status: string; budget: number; spend: number }[];
  invoices: { id: string; description: string; amount: number; status: string; dueDate: string }[];
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch(`/api/clients/${id}`);
    if (res.ok) {
      const data = await res.json();
      setClient(data);
      setForm({
        name: data.name,
        contact: data.contact || "",
        email: data.email || "",
        niche: data.niche || "",
        status: data.status,
        notes: data.notes || "",
      });
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setEditing(false);
    load();
  }

  async function remove() {
    if (!confirm(`Delete ${client?.name}? This removes all of their posts, campaigns and invoices.`)) return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    router.push("/clients");
  }

  if (!client || !form) return <div className="text-cedar-400 text-sm">Loading...</div>;

  const spend = client.campaigns.reduce((s, c) => s + c.spend, 0);
  const revenue = client.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/clients" className="text-sm text-cedar-500 hover:underline">&larr; Partners</Link>
          <h1 className="text-2xl font-bold text-cedar-900 mt-1">{client.name}</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setEditing((e) => !e)}>
            {editing ? "Cancel" : "Edit"}
          </button>
          <button className="btn-danger" onClick={remove}>Delete</button>
        </div>
      </div>

      {editing ? (
        <form onSubmit={save} className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Business name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Contact person</label>
            <input className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Niche</label>
            <input className="input" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="churned">Churned</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button className="btn-primary" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
          </div>
        </form>
      ) : (
        <div className="card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><div className="label">Contact</div>{client.contact || "-"}</div>
          <div><div className="label">Email</div>{client.email || "-"}</div>
          <div><div className="label">Niche</div>{client.niche || "-"}</div>
          <div><div className="label">Status</div>{client.status}</div>
          {client.notes && <div className="col-span-full"><div className="label">Notes</div>{client.notes}</div>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4"><div className="text-2xl font-bold text-cedar-800">{client.posts.length}</div><div className="text-sm text-cedar-500">Content posts</div></div>
        <div className="card p-4"><div className="text-2xl font-bold text-cedar-800">${spend.toLocaleString()}</div><div className="text-sm text-cedar-500">Total ad spend</div></div>
        <div className="card p-4"><div className="text-2xl font-bold text-cedar-800">${revenue.toLocaleString()}</div><div className="text-sm text-cedar-500">Revenue collected</div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold text-cedar-900 mb-3">Recent content</h2>
          {client.posts.slice(0, 5).map((p) => (
            <div key={p.id} className="text-sm py-2 border-b last:border-0 border-cedar-100">
              <div className="font-medium text-cedar-800 truncate">{p.caption}</div>
              <div className="text-cedar-500 text-xs">{p.platform} - {p.status}</div>
            </div>
          ))}
          {client.posts.length === 0 && <p className="text-sm text-cedar-400">No posts yet.</p>}
          <Link href="/calendar" className="text-sm text-cedar-600 hover:underline mt-3 inline-block">Go to calendar</Link>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-cedar-900 mb-3">Boost campaigns</h2>
          {client.campaigns.slice(0, 5).map((c) => (
            <div key={c.id} className="text-sm py-2 border-b last:border-0 border-cedar-100">
              <div className="font-medium text-cedar-800">{c.name}</div>
              <div className="text-cedar-500 text-xs">{c.status} - ${c.spend}/${c.budget}</div>
            </div>
          ))}
          {client.campaigns.length === 0 && <p className="text-sm text-cedar-400">No campaigns yet.</p>}
          <Link href="/campaigns" className="text-sm text-cedar-600 hover:underline mt-3 inline-block">Go to campaigns</Link>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-cedar-900 mb-3">Invoices</h2>
          {client.invoices.slice(0, 5).map((i) => (
            <div key={i.id} className="text-sm py-2 border-b last:border-0 border-cedar-100">
              <div className="font-medium text-cedar-800">{i.description}</div>
              <div className="text-cedar-500 text-xs">${i.amount} - {i.status}</div>
            </div>
          ))}
          {client.invoices.length === 0 && <p className="text-sm text-cedar-400">No invoices yet.</p>}
          <Link href="/invoices" className="text-sm text-cedar-600 hover:underline mt-3 inline-block">Go to invoices</Link>
        </div>
      </div>
    </div>
  );
}

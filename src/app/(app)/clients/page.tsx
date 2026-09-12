"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Client = {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  niche: string | null;
  status: string;
  _count: { posts: number; campaigns: number; invoices: number };
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  paused: "bg-amber-50 text-amber-700",
  churned: "bg-cedar-100 text-cedar-500",
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", email: "", niche: "", status: "active" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/clients");
    setClients(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ name: "", contact: "", email: "", niche: "", status: "active" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cedar-900">Partners</h1>
          <p className="text-cedar-500">The clients your agency supports.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ Add partner"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createClient} className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Business name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Contact person</label>
            <input className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Niche / industry</label>
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
          <div className="sm:col-span-2 flex justify-end">
            <button className="btn-primary" disabled={saving}>{saving ? "Saving..." : "Save partner"}</button>
          </div>
        </form>
      )}

      <div className="card divide-y divide-cedar-100">
        {loading ? (
          <div className="p-6 text-cedar-400 text-sm">Loading...</div>
        ) : clients.length === 0 ? (
          <div className="p-6 text-cedar-400 text-sm">No partners yet - add your first one above.</div>
        ) : (
          clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-cedar-50">
              <div>
                <div className="font-medium text-cedar-900">{c.name}</div>
                <div className="text-sm text-cedar-500">{c.niche || "No niche set"} {c.contact ? `- ${c.contact}` : ""}</div>
              </div>
              <div className="flex items-center gap-4 text-sm text-cedar-500">
                <span>{c._count.posts} posts</span>
                <span>{c._count.campaigns} campaigns</span>
                <span>{c._count.invoices} invoices</span>
                <span className={`badge ${STATUS_STYLES[c.status] || "bg-cedar-100 text-cedar-600"}`}>{c.status}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

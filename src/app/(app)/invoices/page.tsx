"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from "recharts";

type Client = { id: string; name: string };
type Invoice = { id: string; description: string; amount: number; status: string; dueDate: string; client: Client };
type Analytics = {
  revenueByMonth: { month: string; amount: number }[];
  postsByPlatform: { platform: string; count: number }[];
  campaignPerformance: { name: string; spend: number; conversions: number }[];
  unpaidTotal: number;
  paidTotal: number;
  totalSpend: number;
  totalReach: number;
};

const COLORS = ["#3c8268", "#5fa085", "#8fc0a9", "#b9d9ca", "#2b6752", "#18362e"];
const STATUS_COLORS: Record<string, string> = {
  unpaid: "bg-amber-50 text-amber-700",
  paid: "bg-green-50 text-green-700",
  overdue: "bg-red-50 text-red-700",
};

export default function InvoicesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientId: "", description: "", amount: "", dueDate: "" });

  async function load() {
    const [c, inv, an] = await Promise.all([
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/invoices").then((r) => r.json()),
      fetch("/api/analytics").then((r) => r.json()),
    ]);
    setClients(c);
    setInvoices(inv);
    setAnalytics(an);
  }

  useEffect(() => { load(); }, []);

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({ clientId: "", description: "", amount: "", dueDate: "" });
    load();
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this invoice?")) return;
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-cedar-900">Analytics & Invoicing</h1>
        <p className="text-cedar-500">Revenue, spend, and content performance at a glance.</p>
      </div>

      {analytics && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4"><div className="text-2xl font-bold text-cedar-800">${analytics.paidTotal.toLocaleString()}</div><div className="text-sm text-cedar-500">Revenue collected</div></div>
            <div className="card p-4"><div className="text-2xl font-bold text-cedar-800">${analytics.unpaidTotal.toLocaleString()}</div><div className="text-sm text-cedar-500">Outstanding</div></div>
            <div className="card p-4"><div className="text-2xl font-bold text-cedar-800">${analytics.totalSpend.toLocaleString()}</div><div className="text-sm text-cedar-500">Total ad spend</div></div>
            <div className="card p-4"><div className="text-2xl font-bold text-cedar-800">{analytics.totalReach.toLocaleString()}</div><div className="text-sm text-cedar-500">Total reach</div></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-5">
              <h2 className="font-semibold text-cedar-900 mb-3">Revenue, last 6 months</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dcece4" />
                  <XAxis dataKey="month" fontSize={12} stroke="#5fa085" />
                  <YAxis fontSize={12} stroke="#5fa085" />
                  <Tooltip />
                  <Bar dataKey="amount" fill="#3c8268" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-cedar-900 mb-3">Posts by platform</h2>
              {analytics.postsByPlatform.length === 0 ? (
                <p className="text-sm text-cedar-400">No posts yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={analytics.postsByPlatform} dataKey="count" nameKey="platform" outerRadius={80} label>
                      {analytics.postsByPlatform.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {analytics.campaignPerformance.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-cedar-900 mb-3">Campaign spend vs conversions</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={analytics.campaignPerformance} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dcece4" />
                  <XAxis type="number" fontSize={12} stroke="#5fa085" />
                  <YAxis type="category" dataKey="name" width={160} fontSize={11} stroke="#5fa085" />
                  <Tooltip />
                  <Bar dataKey="spend" fill="#8fc0a9" name="Spend ($)" />
                  <Bar dataKey="conversions" fill="#2b6752" name="Conversions" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-cedar-900">Invoices</h2>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "+ Add invoice"}</button>
      </div>

      {showForm && (
        <form onSubmit={createInvoice} className="card p-5 grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="label">Partner</label>
            <select className="input" required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">Select...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <input className="input" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. October retainer" />
          </div>
          <div>
            <label className="label">Amount ($)</label>
            <input className="input" type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="label">Due date</label>
            <input className="input" type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <button className="btn-primary">Save invoice</button>
          </div>
        </form>
      )}

      <div className="card divide-y divide-cedar-100">
        {invoices.length === 0 && <div className="px-5 py-4 text-sm text-cedar-400">No invoices yet.</div>}
        {invoices.map((i) => (
          <div key={i.id} className="px-5 py-4 flex items-center justify-between text-sm">
            <div>
              <div className="font-medium text-cedar-900">{i.description} <span className="text-cedar-400 font-normal">- {i.client.name}</span></div>
              <div className="text-cedar-500 text-xs mt-0.5">${i.amount.toLocaleString()} - due {new Date(i.dueDate).toLocaleDateString()}</div>
            </div>
            <div className="flex items-center gap-2">
              <select value={i.status} onChange={(e) => updateStatus(i.id, e.target.value)} className={`badge border-0 ${STATUS_COLORS[i.status]}`}>
                <option value="unpaid">unpaid</option>
                <option value="paid">paid</option>
                <option value="overdue">overdue</option>
              </select>
              <button className="text-cedar-400 hover:text-red-600 text-xs" onClick={() => remove(i.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

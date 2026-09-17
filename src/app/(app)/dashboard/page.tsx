import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [clientCount, activeCampaigns, upcomingPosts, unpaidInvoices, openTasks] = await Promise.all([
    prisma.client.count({ where: { status: "active" } }),
    prisma.campaign.count({ where: { status: "active" } }),
    prisma.post.findMany({
      where: { date: { gte: now, lte: in7 } },
      orderBy: { date: "asc" },
      include: { client: true },
      take: 6,
    }),
    prisma.invoice.findMany({ where: { status: { in: ["unpaid", "overdue"] } } }),
    prisma.task.findMany({
      where: { userId: user!.id, status: "open" },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      include: { client: true },
      take: 6,
    }),
  ]);

  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.amount, 0);

  const stats = [
    { label: "Active Partners", value: clientCount, href: "/clients" },
    { label: "Active Boost Campaigns", value: activeCampaigns, href: "/campaigns" },
    { label: "Posts Due This Week", value: upcomingPosts.length, href: "/calendar" },
    { label: "Outstanding Invoices", value: `$${unpaidTotal.toLocaleString()}`, href: "/invoices" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-cedar-900">Welcome back{user ? `, ${user.name.split(" ")[0]}` : ""}</h1>
        <p className="text-cedar-500">Here's what's happening across the agency today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-5 hover:shadow-md transition-shadow">
            <div className="text-3xl font-bold text-cedar-800">{s.value}</div>
            <div className="text-sm text-cedar-500 mt-1">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-cedar-900">Upcoming content</h2>
            <Link href="/calendar" className="text-sm text-cedar-600 hover:underline">View calendar</Link>
          </div>
          {upcomingPosts.length === 0 ? (
            <p className="text-sm text-cedar-400">Nothing scheduled in the next 7 days.</p>
          ) : (
            <ul className="space-y-3">
              {upcomingPosts.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-cedar-800">{p.client.name}</div>
                    <div className="text-cedar-500 truncate max-w-xs">{p.caption}</div>
                  </div>
                  <div className="text-right">
                    <div className="badge bg-cedar-100 text-cedar-700">{p.platform}</div>
                    <div className="text-xs text-cedar-400 mt-1">
                      {p.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-cedar-900">Your priority tasks</h2>
            <Link href="/tasks" className="text-sm text-cedar-600 hover:underline">View all tasks</Link>
          </div>
          {openTasks.length === 0 ? (
            <p className="text-sm text-cedar-400">You're all caught up.</p>
          ) : (
            <ul className="space-y-3">
              {openTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-cedar-800">{t.title}</div>
                    {t.client && <div className="text-cedar-500">{t.client.name}</div>}
                  </div>
                  <span
                    className={`badge ${
                      t.priority === "high"
                        ? "bg-red-50 text-red-600"
                        : t.priority === "medium"
                        ? "bg-amber-50 text-amber-600"
                        : "bg-cedar-100 text-cedar-600"
                    }`}
                  >
                    {t.priority}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5 bg-gradient-to-br from-cedar-800 to-cedar-950 text-white">
        <h2 className="font-semibold text-lg">Cedar Point Brain</h2>
        <p className="text-cedar-200 text-sm mt-1 max-w-xl">
          Draft a client report, generate content ideas, prioritize your day, or get ad creative help - your AI
          assistant remembers what you teach it over time.
        </p>
        <Link href="/brain" className="btn-primary mt-4 inline-flex bg-white text-cedar-900 hover:bg-cedar-100">
          Open the Brain
        </Link>
      </div>
    </div>
  );
}

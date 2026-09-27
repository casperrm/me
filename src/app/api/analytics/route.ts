import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [invoices, posts, campaigns] = await Promise.all([
    prisma.invoice.findMany(),
    prisma.post.findMany(),
    prisma.campaign.findMany({ include: { client: true } }),
  ]);

  const monthBuckets: Record<string, number> = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`] = 0;
  }
  for (const inv of invoices) {
    if (inv.status !== "paid" || !inv.paidDate) continue;
    const key = `${inv.paidDate.getFullYear()}-${String(inv.paidDate.getMonth() + 1).padStart(2, "0")}`;
    if (key in monthBuckets) monthBuckets[key] += inv.amount;
  }
  const revenueByMonth = Object.entries(monthBuckets).map(([month, amount]) => ({ month, amount }));

  const platformCounts: Record<string, number> = {};
  for (const p of posts) platformCounts[p.platform] = (platformCounts[p.platform] || 0) + 1;
  const postsByPlatform = Object.entries(platformCounts).map(([platform, count]) => ({ platform, count }));

  const campaignPerformance = campaigns
    .map((c) => ({ name: `${c.client.name} - ${c.name}`, spend: c.spend, conversions: c.conversions }))
    .slice(0, 10);

  const unpaidTotal = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const paidTotal = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalReach = campaigns.reduce((s, c) => s + c.reach, 0);

  return NextResponse.json({ revenueByMonth, postsByPlatform, campaignPerformance, unpaidTotal, paidTotal, totalSpend, totalReach });
}

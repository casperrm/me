import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@cedarpoint.test";
  const password = "demopass123";

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: "Demo Owner", email, passwordHash: await bcrypt.hash(password, 10) },
  });

  const client = await prisma.client.upsert({
    where: { id: "demo-client-acme" },
    update: {},
    create: {
      id: "demo-client-acme",
      name: "Acme Boutique",
      contact: "Jamie Rivera",
      email: "jamie@acmeboutique.example",
      niche: "fashion retail",
      status: "active",
      notes: "Prefers short-form video. Launching a fall collection in October.",
    },
  });

  const now = new Date();
  const inDays = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  // Guard so re-running the seed script doesn't duplicate demo content.
  const alreadySeeded = (await prisma.post.count({ where: { clientId: client.id } })) > 0;

  if (!alreadySeeded) {
    await prisma.post.createMany({
      data: [
        { clientId: client.id, platform: "instagram", caption: "Behind the scenes of our fall photoshoot", date: inDays(2), status: "scheduled" },
        { clientId: client.id, platform: "tiktok", caption: "5 ways to style our new scarf", date: inDays(5), status: "idea" },
      ],
    });

    await prisma.campaign.createMany({
      data: [
        {
          clientId: client.id, name: "Fall Collection Launch", platform: "instagram", goal: "drive site traffic",
          budget: 1500, spend: 620, reach: 42000, engagement: 3100, conversions: 87, status: "active", startDate: now,
        },
      ],
    });

    await prisma.invoice.createMany({
      data: [
        { clientId: client.id, description: "September retainer", amount: 1200, status: "paid", dueDate: inDays(-10), paidDate: inDays(-8) },
        { clientId: client.id, description: "October retainer", amount: 1200, status: "unpaid", dueDate: inDays(20) },
      ],
    });

    await prisma.task.createMany({
      data: [
        { userId: user.id, clientId: client.id, title: "Review fall photoshoot assets", priority: "high", dueDate: inDays(1) },
        { userId: user.id, title: "Send monthly invoices", priority: "medium", dueDate: inDays(3) },
      ],
    });

    await prisma.memoryNote.createMany({
      data: [
        {
          userId: user.id,
          title: "Short-form video outperforms static posts",
          content: "Across our partners, Reels/TikToks are getting 3-4x the reach of static image posts in 2026. Lead with video when possible.",
          tags: "trend,video,strategy",
          source: "manual",
        },
      ],
    });
  }

  console.log("Seeded demo account:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

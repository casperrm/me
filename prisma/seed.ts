import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.create({
    data: { name: "Cedar Point Media" },
  });

  const owner = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "consultingcedarpoint@gmail.com",
      name: "Owner",
      role: "OWNER",
    },
  });

  const client = await prisma.client.create({
    data: {
      organizationId: org.id,
      name: "Volt Mobile",
      companyName: "Volt Mobile Accessories LLC",
      industry: "Consumer Electronics Retail",
      status: "ACTIVE",
      services: JSON.stringify(["Social Media", "Paid Ads", "Video"]),
      primaryContactName: "Layla Haddad",
      primaryContactEmail: "layla@voltmobile.example",
      connectedAccounts: JSON.stringify([
        { platform: "meta", accountId: "act_1029384756", status: "connected" },
        { platform: "tiktok", accountId: "tt_5566778899", status: "disconnected" },
      ]),
    },
  });

  await prisma.brandDNA.create({
    data: {
      clientId: client.id,
      colors: JSON.stringify([
        { name: "Volt Yellow", hex: "#F5C518" },
        { name: "Charcoal", hex: "#1C1C1E" },
        { name: "White", hex: "#FFFFFF" },
      ]),
      fonts: JSON.stringify([
        { role: "Heading", family: "Poppins" },
        { role: "Body", family: "Inter" },
      ]),
      toneOfVoice: "Energetic, confident, a little playful — speaks to tech-savvy young professionals.",
      visualStyle: "Bold flat-color backgrounds, high-contrast product shots, minimal clutter.",
      targetAudience: "18-34 year olds who are always on their phone and hate slow chargers.",
      products: JSON.stringify(["Fast chargers", "Power banks", "Phone cases", "Cables"]),
      approvedPatterns: JSON.stringify(["Bold single-color backgrounds", "Bold typographic hooks"]),
      rejectedPatterns: JSON.stringify(["Busy collage layouts", "Stock photography of generic offices"]),
    },
  });

  await prisma.clientTimelineEvent.createMany({
    data: [
      { clientId: client.id, type: "first_contact", summary: "Inbound inquiry via Instagram DM.", occurredAt: new Date("2025-11-02") },
      { clientId: client.id, type: "contract_signed", summary: "Signed 6-month retainer for social + paid ads.", occurredAt: new Date("2025-11-10") },
      { clientId: client.id, type: "project_started", summary: "Kicked off 'FastCharge Launch' campaign.", occurredAt: new Date("2025-12-01") },
      { clientId: client.id, type: "payment", summary: "December retainer invoice paid.", occurredAt: new Date("2025-12-05") },
    ],
  });

  await prisma.clientHealthScore.create({
    data: {
      clientId: client.id,
      score: 82,
      factors: JSON.stringify({ relationship: 90, performance: 78, delays: 85, approvals: 80, payments: 95, communication: 75 }),
    },
  });

  const project = await prisma.project.create({
    data: {
      clientId: client.id,
      name: "FastCharge Launch",
      status: "IN_PROGRESS",
      dueDate: new Date("2026-09-20"),
    },
  });

  await prisma.task.createMany({
    data: [
      { projectId: project.id, title: "Draft campaign brief", status: "done", assigneeId: owner.id },
      { projectId: project.id, title: "Design 3 static ad concepts", status: "in_progress", assigneeId: owner.id },
      { projectId: project.id, title: "Storyboard launch reel", status: "todo" },
    ],
  });

  const campaign = await prisma.campaign.create({
    data: {
      projectId: project.id,
      name: "FastCharge 65W Launch",
      objective: "Drive pre-orders for the new 65W GaN charger",
      status: "PENDING_APPROVAL",
      platform: "meta",
      budgetCents: 150000,
      kpis: JSON.stringify({ impressions: 0, clicks: 0, conversions: 0, spend: 0 }),
    },
  });

  const creative = await prisma.creative.create({
    data: {
      campaignId: campaign.id,
      type: "carousel",
      platform: "instagram_feed",
      status: "PENDING_APPROVAL",
    },
  });

  await prisma.creativeVersion.create({
    data: { creativeId: creative.id, version: 1, notes: "First draft — bold yellow background, product hero shot." },
  });

  await prisma.invoice.createMany({
    data: [
      { clientId: client.id, amountCents: 250000, status: "PAID", issuedAt: new Date("2025-12-01"), paidAt: new Date("2025-12-05") },
      { clientId: client.id, amountCents: 250000, status: "SENT", issuedAt: new Date("2026-01-01"), dueAt: new Date("2026-01-15") },
    ],
  });

  await prisma.expense.createMany({
    data: [
      { organizationId: org.id, category: "Software", amountCents: 15000, description: "Design + scheduling tools", incurredAt: new Date("2025-12-15") },
      { organizationId: org.id, category: "Contractor", amountCents: 60000, description: "Freelance video editor", incurredAt: new Date("2025-12-20") },
    ],
  });

  await prisma.note.create({
    data: { clientId: client.id, body: "Client prefers reels over static posts — engagement is 3x higher." },
  });

  console.log("Seeded Cedar Point OS with demo data.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

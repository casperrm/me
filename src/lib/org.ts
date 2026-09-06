import { prisma } from "@/lib/prisma";

// No auth/session layer yet (Section 29-30 is roadmapped, see ARCHITECTURE.md).
// Every page scopes to the first organization so the data model and UI can
// be built and exercised end-to-end before multi-tenant login exists.
export async function getCurrentOrganization() {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    throw new Error("No organization found. Run `npm run db:seed` first.");
  }
  return org;
}

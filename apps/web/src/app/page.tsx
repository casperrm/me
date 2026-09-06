import { redirect } from "next/navigation";
import { prisma } from "@cedar/db";
import { getCurrentActor } from "@/lib/current-actor";

export const dynamic = "force-dynamic";

export default async function Home() {
  const orgCount = await prisma.organization.count();
  if (orgCount === 0) redirect("/setup");

  const actor = await getCurrentActor();
  redirect(actor ? "/dashboard" : "/login");
}

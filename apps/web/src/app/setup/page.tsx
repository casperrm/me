import { redirect } from "next/navigation";
import { prisma } from "@cedar/db";
import { BootstrapForm } from "./BootstrapForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const orgCount = await prisma.organization.count();
  if (orgCount > 0) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-cedar-600" />
          <span className="text-sm font-semibold tracking-tight">Cedar Point OS</span>
        </div>
        <h1 className="mb-1 text-lg font-semibold">Create your organization</h1>
        <p className="mb-4 text-xs text-neutral-500">
          This creates the first account, with the Owner role. Everyone after you joins by invitation
          (Bible Section 29).
        </p>
        <BootstrapForm />
      </div>
    </div>
  );
}

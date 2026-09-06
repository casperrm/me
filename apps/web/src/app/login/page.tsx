import { redirect } from "next/navigation";
import { prisma } from "@cedar/db";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const orgCount = await prisma.organization.count();
  if (orgCount === 0) redirect("/setup");

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-cedar-600" />
          <span className="text-sm font-semibold tracking-tight">Cedar Point OS</span>
        </div>
        <h1 className="mb-4 text-lg font-semibold">Log in</h1>
        <LoginForm />
      </div>
    </div>
  );
}

import { Card } from "@/components/Card";
import { requireActor } from "@/lib/guards";
import { prisma } from "@cedar/db";
import { MfaEnrollment } from "./MfaEnrollment";
import { DisableMfaForm } from "./DisableMfaForm";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const actor = await requireActor();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.user.id }, select: { mfaEnabled: true } });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security</h1>
        <p className="text-sm text-neutral-500">Manage two-factor authentication for your account.</p>
      </div>
      <Card title="Two-factor authentication">
        {user.mfaEnabled ? <DisableMfaForm /> : <MfaEnrollment />}
      </Card>
    </div>
  );
}

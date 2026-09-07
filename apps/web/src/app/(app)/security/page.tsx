import { Card } from "@/components/Card";
import { requireActor } from "@/lib/guards";
import { prisma } from "@cedar/db";
import { isMfaEnrollmentRequired } from "@/lib/services/mfa-policy-service";
import { MfaEnrollment } from "./MfaEnrollment";
import { DisableMfaForm } from "./DisableMfaForm";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const actor = await requireActor();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.user.id }, select: { mfaEnabled: true } });
  // Recomputed independently of the ?mfaRequired=1 hint AppLayout's
  // redirect adds — this banner has to be correct for a direct visit or
  // bookmark too, not just the redirect path.
  const mfaRequired = await isMfaEnrollmentRequired({ ...actor, user: { mfaEnabled: user.mfaEnabled } });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security</h1>
        <p className="text-sm text-neutral-500">Manage two-factor authentication for your account.</p>
      </div>
      {mfaRequired && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your organization requires two-factor authentication for your role. You won&apos;t be able to use the
          rest of Cedar Point OS until you enable it below.
        </div>
      )}
      <Card title="Two-factor authentication">
        {user.mfaEnabled ? <DisableMfaForm /> : <MfaEnrollment />}
      </Card>
    </div>
  );
}

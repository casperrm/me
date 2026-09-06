import { getInvitationPreview } from "@/lib/services/membership-service";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationPreview(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-cedar-600" />
          <span className="text-sm font-semibold tracking-tight">Cedar Point OS</span>
        </div>
        {!invitation ? (
          <p className="text-sm text-red-600">This invitation is invalid or has expired.</p>
        ) : (
          <>
            <h1 className="mb-1 text-lg font-semibold">Join Cedar Point OS</h1>
            <p className="mb-4 text-xs text-neutral-500">
              Invited as <span className="font-medium">{invitation.email}</span> with the{" "}
              <span className="font-medium">{invitation.role}</span> role.
            </p>
            <AcceptInviteForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}

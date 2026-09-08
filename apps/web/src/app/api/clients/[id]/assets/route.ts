import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { AssetValidationError, uploadAsset } from "@/lib/services/asset-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!formData || !(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await uploadAsset({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      clientId: id,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      data: buffer,
    });
    return NextResponse.json({ ok: true, assetId: asset.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to upload files for this client." }, { status: 403 });
    }
    if (err instanceof MfaRequiredError) {
      return NextResponse.json(
        { error: "MFA enrollment is required for this account before this action can be performed." },
        { status: 403 },
      );
    }
    if (err instanceof AssetValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

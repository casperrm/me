import { NextResponse } from "next/server";
import { prisma } from "@cedar/db";
import { storageAdapter, verifyAssetToken } from "@/lib/storage";

// Deliberately no session/permission check here beyond the signed token —
// see the comment in lib/storage/signed-url.ts for why that's correct,
// not an oversight.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token");

  if (!token || !verifyAssetToken(id, token)) {
    return NextResponse.json({ error: "This download link is invalid or has expired." }, { status: 403 });
  }

  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const data = await storageAdapter.read(asset.storageKey);

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": asset.contentType ?? "application/octet-stream",
      "content-disposition": `attachment; filename="${encodeURIComponent(asset.filename)}"`,
      "cache-control": "private, max-age=0, no-store",
    },
  });
}

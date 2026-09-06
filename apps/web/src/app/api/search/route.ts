import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/current-actor";
import { getReadableClientIds } from "@/lib/readable-clients";
import { searchRecords } from "@/lib/services/search-service";

export async function GET(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const query = new URL(req.url).searchParams.get("q") ?? "";
  const clientIds = await getReadableClientIds(actor);

  const results = await searchRecords({ organizationId: actor.organizationId, clientIds, query });
  return NextResponse.json({ results });
}

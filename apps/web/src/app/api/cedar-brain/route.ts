import { NextResponse } from "next/server";
import { prisma } from "@cedar/db";
import { getCurrentActor } from "@/lib/current-actor";
import { routeToAgents, callCedarBrain } from "@/lib/cedar-brain";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { prompt, clientId } = await req.json();

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const agents = routeToAgents(prompt);

  try {
    const result = await callCedarBrain(prompt, agents);

    await prisma.cedarBrainRequest.create({
      data: {
        organizationId: actor.organizationId,
        prompt,
        routedAgents: JSON.stringify(agents),
        response: JSON.stringify(result),
        clientId: clientId ?? null,
      },
    });

    return NextResponse.json({ agents, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cedar Brain request failed" },
      { status: 500 },
    );
  }
}

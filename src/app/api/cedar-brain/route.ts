import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { routeToAgents, callCedarBrain } from "@/lib/cedar-brain";

export async function POST(req: Request) {
  const { prompt, clientId } = await req.json();

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const agents = routeToAgents(prompt);

  try {
    const result = await callCedarBrain(prompt, agents);

    await prisma.cedarBrainRequest.create({
      data: {
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

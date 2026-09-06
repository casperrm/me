import { NextResponse } from "next/server";
import { prisma } from "@cedar/db";
import { getCurrentActor } from "@/lib/current-actor";
import { routeToAgents, callCedarBrain, CEDAR_BRAIN_PROMPT_VERSION } from "@/lib/cedar-brain";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { prompt, clientId } = await req.json();

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const agents = routeToAgents(prompt);
  const startedAt = Date.now();

  try {
    const result = await callCedarBrain(prompt, agents);
    const latencyMs = Date.now() - startedAt;

    const record = await prisma.cedarBrainRequest.create({
      data: {
        organizationId: actor.organizationId,
        prompt,
        routedAgents: JSON.stringify(agents),
        response: JSON.stringify(result),
        clientId: clientId ?? null,
        mode: result.mode,
        modelName: result.mode === "live" ? "claude-sonnet-5" : null,
        promptVersion: CEDAR_BRAIN_PROMPT_VERSION,
        latencyMs,
        success: true,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
      },
    });

    return NextResponse.json({ agents, ...result, cedarBrainRequestId: record.id });
  } catch (err) {
    // Section 6.3's AI Supervisor needs failed requests logged too, not
    // just successes — a request that errors out is exactly the signal
    // it exists to surface (see ADR-007 and docs/specs/ai-supervisor.md).
    const latencyMs = Date.now() - startedAt;
    const errorMessage = err instanceof Error ? err.message : "Cedar Brain request failed";

    await prisma.cedarBrainRequest.create({
      data: {
        organizationId: actor.organizationId,
        prompt,
        routedAgents: JSON.stringify(agents),
        response: null,
        clientId: clientId ?? null,
        mode: "live",
        modelName: "claude-sonnet-5",
        promptVersion: CEDAR_BRAIN_PROMPT_VERSION,
        latencyMs,
        success: false,
        errorMessage,
      },
    });

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

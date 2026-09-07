import { NextResponse } from "next/server";
import { prisma } from "@cedar/db";
import { getCurrentActor } from "@/lib/current-actor";
import { routeToAgents, callCedarBrain, CEDAR_BRAIN_PROMPT_VERSION, SYSTEM_PROMPT_TEMPLATE } from "@/lib/cedar-brain";
import { buildGovernedContext } from "@/lib/services/context-retrieval-service";
import { alertIfOverBudget, getAiBudgetStatus } from "@/lib/services/ai-budget-service";
import { ensurePromptSnapshotRecorded } from "@/lib/services/prompt-registry-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { prompt, clientId } = await req.json();

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // Section 6.1: "Authorize the requested operation before retrieving
  // sensitive context" — this happens before anything else, and a denial
  // here fails the whole request rather than silently sending the prompt
  // with no context.
  let governedContext: { text: string; sources: string[] } | null = null;
  if (clientId) {
    try {
      governedContext = await buildGovernedContext({ actorUserId: actor.user.id, organizationId: actor.organizationId, clientId });
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 403 });
      throw err;
    }
  }

  // Section 33 budget enforcement: only relevant when a live call would
  // actually cost real money (ANTHROPIC_API_KEY set) and the org has
  // opted into a limit — no default budget is ever fabricated, and stub
  // mode is never blocked since it has zero real cost either way. See
  // docs/specs/ai-budget-governance.md.
  if (process.env.ANTHROPIC_API_KEY) {
    const budgetStatus = await getAiBudgetStatus(actor.organizationId);
    if (budgetStatus.overBudget) {
      await alertIfOverBudget(actor.organizationId);
      return NextResponse.json(
        {
          error: `AI budget exceeded for this month (${budgetStatus.usedTokensThisMonth.toLocaleString()} / ${budgetStatus.monthlyTokenLimit!.toLocaleString()} tokens used). Ask an admin to raise the budget, or wait until next month.`,
        },
        { status: 402 },
      );
    }
  }

  // Best-effort audit capture (Section 33 prompt registry) — never lets
  // an auditing write break the actual Cedar Brain request. See
  // docs/specs/cedar-prompt-registry.md.
  try {
    await ensurePromptSnapshotRecorded(CEDAR_BRAIN_PROMPT_VERSION, SYSTEM_PROMPT_TEMPLATE);
  } catch {
    // Non-critical — the request proceeds either way.
  }

  const agents = routeToAgents(prompt);
  const startedAt = Date.now();

  try {
    const result = await callCedarBrain(prompt, agents, governedContext?.text);
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

    return NextResponse.json({
      agents,
      ...result,
      cedarBrainRequestId: record.id,
      contextSources: governedContext?.sources ?? [],
    });
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

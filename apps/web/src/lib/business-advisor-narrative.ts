import type { BusinessAdvisorBriefing } from "./services/business-advisor-service";

/**
 * Section 16.2: "Recommendations must expose assumptions and underlying
 * metrics." The briefing itself (business-advisor-service.ts) is the real
 * data — this narrative is only ever a restatement of it in prose, never a
 * second source of claims. Same live/stub pattern as cedar-brain.ts: no
 * ANTHROPIC_API_KEY means a deterministic plain-language summary built
 * directly from the numbers (still fully real, just not prose-polished);
 * a key present means Claude turns the same numbers into a tighter
 * narrative, explicitly instructed not to introduce anything beyond what
 * was given.
 */
export async function generateBusinessAdvisorNarrative(
  briefing: BusinessAdvisorBriefing,
): Promise<{ mode: "live" | "stub"; text: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { mode: "stub", text: buildStubNarrative(briefing) };
  }

  const systemPrompt = `You are the Cedar Point OS AI Business Advisor (Bible Section 16.2). You will be given a
JSON object containing the ONLY real data available: unprofitable engagements, cost leakage by
expense category, strong services, team capacity risks, invoice collection risks, and
evidence-backed upsell opportunities. Write a short (4-6 sentence) executive narrative
explaining what these numbers mean for the business. You MUST NOT invent any number, client
name, or fact not present in the JSON. If a section of the JSON is empty, do not claim a
problem exists there — say that area looks healthy instead.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(briefing) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.content?.map((block: { text?: string }) => block.text ?? "").join("\n") ?? "";
  return { mode: "live", text };
}

function buildStubNarrative(briefing: BusinessAdvisorBriefing): string {
  const lines: string[] = [];

  if (briefing.unprofitableEngagements.length > 0) {
    lines.push(
      `${briefing.unprofitableEngagements.length} client engagement(s) are currently unprofitable, most notably ${briefing.unprofitableEngagements[0].clientName}.`,
    );
  } else {
    lines.push("No client engagements are currently unprofitable.");
  }

  if (briefing.costLeakage.length > 0) {
    const top = briefing.costLeakage[0];
    lines.push(`The largest expense category is ${top.category}, accounting for ${top.shareOfTotalPct.toFixed(0)}% of recorded spend.`);
  }

  if (briefing.strongServices.length > 0) {
    const top = briefing.strongServices[0];
    lines.push(`${top.service} is the strongest service, offered to ${top.totalClientCount} clients with ${top.profitableClientCount} of them profitable.`);
  }

  if (briefing.capacityRisks.length > 0) {
    lines.push(`${briefing.capacityRisks.length} team member(s) are carrying a heavy task load, led by ${briefing.capacityRisks[0].memberName}.`);
  } else {
    lines.push("No team member currently shows a concerning task backlog.");
  }

  if (briefing.collectionRisks.length > 0) {
    lines.push(`${briefing.collectionRisks.length} client(s) have overdue unpaid invoices needing collection follow-up.`);
  } else {
    lines.push("No overdue unpaid invoices to collect.");
  }

  if (briefing.upsellRollup.length > 0) {
    const top = briefing.upsellRollup[0];
    lines.push(`The strongest cross-sell signal is "${top.label}", a gap for ${top.clientCount} client(s) who don't have it yet.`);
  }

  return lines.join(" ");
}

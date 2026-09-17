import Anthropic from "@anthropic-ai/sdk";

export const BRAIN_MODEL = "claude-sonnet-5";

export function isBrainConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function askBrain(params: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
}): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) {
    return (
      "The Cedar Point Brain isn't connected yet - add an ANTHROPIC_API_KEY to your " +
      ".env file (see .env.example) and restart the server to turn this on. " +
      "Once connected, I'll be able to write client reports, generate content ideas, " +
      "prioritize your tasks, help with ad creative, and remember what you teach me over time."
    );
  }

  try {
    const response = await anthropic.messages.create({
      model: BRAIN_MODEL,
      max_tokens: params.maxTokens ?? 1200,
      system: params.system,
      messages: params.messages,
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text : "";
  } catch (err: any) {
    return `The Brain hit an error talking to the AI service: ${err?.message ?? "unknown error"}. Check your ANTHROPIC_API_KEY and try again.`;
  }
}

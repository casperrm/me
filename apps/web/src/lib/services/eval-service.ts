// AI Evaluation Harness (Section 6.3/33) — a real, deterministic
// regression suite for Cedar Brain's routing logic. See
// docs/specs/ai-eval-harness.md for exactly what this does and does
// not cover.
import { prisma } from "@cedar/db";
import { routeToAgents, type CedarAgent } from "@/lib/cedar-brain";

export const ROUTING_EVAL_SUITE = "cedar-brain-routing";

export interface RoutingEvalCase {
  name: string;
  prompt: string;
  expectedAgents: CedarAgent[];
}

// Each case is a judgment call an agency employee reading the prompt
// would make independently of routeToAgents' own keyword list — the
// point of a golden set is to catch a routing regression, which it
// can't do if the "expected" answer is just re-derived from the same
// implementation being tested. Every request also implicitly expects
// quality_control (routeToAgents always appends it), so that's folded
// into each case's expectedAgents rather than asserted separately.
export const ROUTING_GOLDEN_SET: RoutingEvalCase[] = [
  {
    name: "video shoot script request",
    prompt: "Can you draft a script and shot list for our next product demo Reel?",
    expectedAgents: ["video", "quality_control"],
  },
  {
    name: "logo and banner design request",
    prompt: "We need a new banner and logo variant for the homepage takeover.",
    expectedAgents: ["design", "quality_control"],
  },
  {
    name: "arabic translation request",
    prompt: "Please translate this product summary into Arabic for our Gulf audience.",
    expectedAgents: ["localization", "quality_control"],
  },
  {
    name: "ad platform budget question",
    prompt: "What should our Meta budget be next month given current KPI targets?",
    expectedAgents: ["campaign", "quality_control"],
  },
  {
    name: "proofreading request",
    prompt: "Can you review this caption for typos before it goes out?",
    expectedAgents: ["quality_control"],
  },
  {
    name: "campaign launch strategy",
    prompt: "Help me put together a promotional campaign hook for our spring sale launch.",
    expectedAgents: ["marketing", "quality_control"],
  },
  {
    name: "video + design cross-format request",
    prompt: "We need a storyboard for the video AND a matching carousel graphic for the same campaign.",
    expectedAgents: ["marketing", "design", "video", "quality_control"],
  },
  {
    name: "vague request with no domain keywords falls back to marketing",
    prompt: "Can you help me with the Volt Mobile account this week?",
    expectedAgents: ["marketing", "quality_control"],
  },
  {
    name: "french localization for an ad",
    prompt: "Localize this ad copy into French for our Quebec audience.",
    expectedAgents: ["marketing", "localization", "quality_control"],
  },
  {
    name: "QC-specific check on copy",
    prompt: "Quality check this copy against our brand guidelines before it ships.",
    expectedAgents: ["quality_control"],
  },
];

function sameAgentSet(a: CedarAgent[], b: CedarAgent[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((agent) => setA.has(agent));
}

export async function runRoutingEval() {
  const results = ROUTING_GOLDEN_SET.map((testCase) => {
    const actual = routeToAgents(testCase.prompt);
    const passed = sameAgentSet(actual, testCase.expectedAgents);
    return { ...testCase, actual, passed };
  });

  return prisma.aiEvalRun.create({
    data: {
      suite: ROUTING_EVAL_SUITE,
      totalCases: results.length,
      passedCases: results.filter((r) => r.passed).length,
      results: {
        create: results.map((r) => ({
          caseName: r.name,
          input: r.prompt,
          expected: JSON.stringify(r.expectedAgents),
          actual: JSON.stringify(r.actual),
          passed: r.passed,
        })),
      },
    },
    include: { results: true },
  });
}

export async function getRecentEvalRuns(limit = 10) {
  return prisma.aiEvalRun.findMany({
    where: { suite: ROUTING_EVAL_SUITE },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { results: true },
  });
}

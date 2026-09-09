// AI Evaluation Harness (Section 6.3/33) — scheduled follow-up to
// docs/specs/ai-eval-harness.md's own explicitly-named gap ("No CI/
// scheduled automatic runs — the harness runs on demand via the 'Run
// eval now' button"). Runs the same routing regression suite
// `/command/supervisor`'s button triggers, daily, so a routing
// regression is caught even if no one clicks the button. Calls
// @cedar/ai's runRoutingEval directly — this is the reason
// routeToAgents/runRoutingEval moved to packages/ai in the first place,
// since apps/worker has never imported from apps/web.
import { runRoutingEval } from "@cedar/ai";
import { logger } from "@cedar/observability";

export async function runAiEvalJob() {
  const run = await runRoutingEval();
  logger.info("ai eval job complete", {
    suite: run.suite,
    totalCases: run.totalCases,
    passedCases: run.passedCases,
  });
  return run;
}

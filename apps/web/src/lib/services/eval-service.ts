// AI Evaluation Harness (Section 6.3/33) — the harness itself
// (ROUTING_EVAL_SUITE/ROUTING_GOLDEN_SET/runRoutingEval/getRecentEvalRuns)
// moved to packages/ai/src/eval.ts so apps/worker's scheduled eval job
// (apps/worker/src/jobs/ai-eval.ts) can call it without crossing the
// apps/worker → apps/web boundary — see docs/adr/0007-ai-provider-gateway.md's
// dated log and docs/specs/ai-eval-harness.md for exactly why. This is a
// thin re-export so every existing importer (/api/eval/run/route.ts,
// /command/supervisor's page.tsx) keeps working unchanged, the same
// backward-compatibility pattern mfa-policy-service.ts already used when
// MFA_PRIVILEGED_ROLES moved to packages/domain.
export * from "@cedar/ai";

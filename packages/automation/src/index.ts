// Workflow engine contracts — event-driven, policy-aware automation
// (Bible Section 18). A first real cut lives in ./workflow.ts: a
// runWorkflow() executor with durable per-step tracking (Section 18.2).
// See docs/specs/automation-engine.md for what's built and what's
// deliberately still out of scope (a generic trigger registry, a rule
// builder, step-level retries).
export * from "./workflow";

// Connector SDK: the Section 34 adapter contract, plus provider adapters.
// GenericWebhookAdapter is the one real, fully-working implementation so
// far — see docs/specs/integration-center.md for what's built versus
// deferred (Meta/TikTok/Google/WhatsApp need real OAuth app registrations
// this environment can't obtain).
export * from "./contract";
export * from "./generic-webhook-adapter";

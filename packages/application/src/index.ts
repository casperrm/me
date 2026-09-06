// Use cases / commands / queries shared across apps/web and apps/api
// (Bible Section 35). Phase 0's use cases (invite member, accept
// invitation, change role) currently live as server actions directly in
// apps/web — see docs/adr/0002-modular-monolith-boundaries.md for why:
// there is exactly one caller today, and extracting an interface before a
// second caller (apps/api) exists would be speculative. Move a use case
// here the moment a second app needs to call it without duplicating logic.
export {};

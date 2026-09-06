import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (PostgreSQL connection string)"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters — generate with `openssl rand -hex 32`"),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/**
 * Loads and validates environment variables for any app/package in the
 * monorepo. Every workspace shares one `.env` at the repo root — apps call
 * this once at startup rather than reading `process.env` directly, so a
 * missing/invalid variable fails fast with a clear message instead of
 * surfacing as a confusing runtime error three layers down.
 */
export function loadEnv(rootDir = findRepoRoot()): Env {
  if (cached) return cached;

  const envPath = path.join(rootDir, ".env");
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath });
  }

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(
      `Invalid environment configuration (looked for .env at ${envPath}):\n${issues}\n` +
        `Copy .env.example to .env at the repo root and fill in real values.`,
    );
  }

  cached = parsed.data;
  return cached;
}

function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml")) || existsSync(path.join(dir, "package.json"))) {
      // Root package.json declares workspaces; nested ones won't.
      try {
        const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8"));
        if (pkg.workspaces) return dir;
      } catch {
        // ignore and keep walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

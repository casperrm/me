// HTTP/API application (Bible Section 35). Phase 0 keeps this
// intentionally thin: health/readiness only. The actual application use
// cases (auth, membership, invitations) currently live as Next.js server
// actions in apps/web — see docs/adr/0002-modular-monolith-boundaries.md
// for why, and what would trigger moving them behind this HTTP surface
// (a second caller: the Client Portal, a mobile app, or a public API).
import Fastify from "fastify";
import { loadEnv } from "@cedar/config";
import { prisma } from "@cedar/db";
import { logger } from "@cedar/observability";

const env = loadEnv();
const app = Fastify({ logger: false });

app.get("/health", async () => ({ status: "ok" }));

app.get("/ready", async (_req, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ready", database: "connected" };
  } catch (err) {
    logger.error("Readiness check failed: database unreachable", { error: String(err) });
    reply.code(503);
    return { status: "not_ready", database: "unreachable" };
  }
});

const port = Number(process.env.API_PORT ?? 4000);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => logger.info(`apps/api listening on :${port}`, { env: env.NODE_ENV }))
  .catch((err) => {
    logger.error("apps/api failed to start", { error: String(err) });
    process.exit(1);
  });

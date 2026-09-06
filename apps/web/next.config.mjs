import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app lives inside an npm-workspaces monorepo — tell Next where the
  // real root is so its file tracing doesn't get confused about which
  // node_modules/lockfile governs the build.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Workspace packages ship TypeScript source with no build step; Next
  // needs to transpile them itself rather than expecting compiled JS.
  transpilePackages: ["@cedar/auth", "@cedar/config", "@cedar/db", "@cedar/domain", "@cedar/events"],
};

export default nextConfig;

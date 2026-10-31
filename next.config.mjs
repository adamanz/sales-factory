import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root },
  // The scorecard rubric is read with fs at runtime; make sure serverless bundles ship it.
  outputFileTracingIncludes: { "/api/scorecard": ["./agents/scorecard-rubric.md"] },
};
export default nextConfig;

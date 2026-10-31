import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root },
  // Dev HMR is blocked when the browser uses 127.0.0.1 instead of localhost.
  allowedDevOrigins: ["127.0.0.1"],
};
export default nextConfig;

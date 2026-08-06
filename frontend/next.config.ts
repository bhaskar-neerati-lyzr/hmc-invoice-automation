import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server (.next/standalone) with only the
  // production deps it actually needs traced in - lets the Docker runtime
  // stage skip `npm install`/node_modules entirely and copy a fraction of
  // the files, instead of shipping full node_modules.
  output: "standalone",
};

export default nextConfig;

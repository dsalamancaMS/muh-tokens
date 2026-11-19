import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  // The Docker build sets this to get a self-contained server in .next/standalone.
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
};

export default nextConfig;

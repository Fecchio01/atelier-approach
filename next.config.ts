import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  allowedDevOrigins: ['127.0.0.1'],
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ['@duckdb/node-api', '@duckdb/node-bindings']
};

export default withWorkflow(nextConfig);

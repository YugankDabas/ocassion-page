import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts' },
  // Shown on GET /healthz, to tell which build is running.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  clean: true,
  splitting: true,
});

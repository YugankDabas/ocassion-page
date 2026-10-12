import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  clean: true,
  splitting: true,
});

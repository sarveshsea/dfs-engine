import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@buzzr/dfs-engine': resolve(here, '../dfs-engine/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});

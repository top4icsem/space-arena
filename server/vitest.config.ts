import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: { name: 'server', environment: 'node', include: ['**/*vitest.test.ts'] },
});

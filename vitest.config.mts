import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The kernel is plain TypeScript with no React import, so its tests run in a
 * bare node environment — no jsdom, no component harness.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['kernel/**/*.test.ts', 'lib/**/*.test.ts', 'apps/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})

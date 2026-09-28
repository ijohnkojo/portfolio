import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Everything tested here is plain TypeScript with no DOM — the site's content
 * and graph logic under lib/, and the OS under os/ — so it all runs in a bare
 * node environment, with no jsdom and no component harness.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'os/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})

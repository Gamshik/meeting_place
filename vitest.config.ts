import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/database/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})

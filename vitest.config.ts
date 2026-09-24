import { defineConfig } from 'vitest/config'

import { aliases } from './aliases.ts'

export default defineConfig({
  resolve: { alias: aliases },
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

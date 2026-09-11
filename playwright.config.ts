import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && wrangler dev --ip 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://browser-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'browser-test-key',
      WRANGLER_LOG_PATH: '.wrangler/browser-tests.log',
    },
  },
})

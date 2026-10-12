// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.js/,
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    browserName: 'chromium',
  },
  webServer: [
    {
      command: 'node tests/static-server.mjs',
      url: 'http://localhost:4173',
      env: { EXTRA_CONNECT_SRC: 'http://localhost:54329' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'deno run --allow-net tests/mock-api.ts',
      url: 'http://localhost:54329/__stored',
      reuseExistingServer: !process.env.CI,
    },
  ],
});

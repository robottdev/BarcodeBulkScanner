import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["iPhone 13"],
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

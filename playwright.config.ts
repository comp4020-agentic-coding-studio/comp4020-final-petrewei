import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Every browser shares these two markets. Independent visitors belong
  // inside a test, and rounds run one test at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 45_000,
  outputDir: "output/playwright",
  use: { baseURL: "http://localhost:8187", trace: "off", screenshot: "off", video: "off" },
  projects: ["en", "ja", "zh"].flatMap((lang) => [
    { name: `${lang}-desktop`, metadata: { lang }, use: { viewport: { width: 1920, height: 1080 } } },
    { name: `${lang}-phone`, metadata: { lang }, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ]),
  // Always start our own disposable server. Browser checks cannot be
  // pointed at the public market or reuse somebody's development data.
  webServer: {
    command: "node scripts/browser-server.ts",
    url: "http://localhost:8187",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});

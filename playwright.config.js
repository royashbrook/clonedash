import { defineConfig } from "@playwright/test";
const url =
  process.env.GAME_URL || `http://127.0.0.1:${process.env.PORT || 4191}`;
export default defineConfig({
  // Automatic PR diff capture fetches the base with --depth=1 and truncates the
  // real release history used by update.spec. Keep commit metadata, not that fetch.
  captureGitInfo: { diff: false },
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: url,
    viewport: { width: 932, height: 430 },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "webkit",
      use: { browserName: "webkit" },
      // Linux WebKit on CI intermittently fails page.goto/page.reload with
      // "WebKit encountered an internal error" before any assertion runs (#20).
      // One retry on CI covers that class only; chromium keeps zero. Traces are
      // retained on failure and uploaded by the workflows. Root cause is open.
      retries: process.env.CI ? 1 : 0,
    },
  ],
  webServer: process.env.GAME_URL
    ? undefined
    : { command: "npm run preview", url, reuseExistingServer: false },
});

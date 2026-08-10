import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One Vite dev server serves every worker, and these tests wait on streamed
  // responses; in parallel they fail on server contention rather than on a bug.
  // The whole suite runs in well under a minute serially.
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5176",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
    // The app follows the OS theme on first visit now. Pin the emulated
    // preference to dark so the default-theme baselines stay deterministic;
    // the theme test switches explicitly rather than through the media query.
    colorScheme: "dark",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});

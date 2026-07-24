import { defineConfig, devices } from "@playwright/test";

// E2E against a real Vite build running on MockBackend — level 2 of the pyramid
// (docs/architecture/testing.md). No Tauri shell: the smoke suite that exercises
// the real IPC path is #14.
const PORT = 4173;
const URL = `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  // Vitest owns `*.spec.ts`; these are the only files Playwright picks up.
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: CI,
  // No retries anywhere: the suite drives a scripted backend with no timers of
  // its own, so a failure is a bug and a retry would only hide it.
  retries: 0,
  reporter: CI ? "github" : "list",
  use: {
    baseURL: URL,
    // The app is desktop-only, minimum 900 px wide (PROJECT.md §2).
    viewport: { width: 1100, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: {
    command: `npm run build:mock && npm run preview -- --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});

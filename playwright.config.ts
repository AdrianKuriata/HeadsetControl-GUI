import { defineConfig, devices } from "@playwright/test";

// E2E against a real Vite build running on MockBackend — level 2 of the pyramid
// (docs/architecture/testing.md). No Tauri shell: the smoke suite that exercises
// the real IPC path is #14.
const PORT = 4173;
const HOST = "127.0.0.1";
const URL = `http://${HOST}:${PORT}`;
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
    // `--host` is not optional: left to its default, `vite preview` binds
    // whatever `localhost` resolves to, which on a CI runner can be IPv6 only —
    // the poll on 127.0.0.1 then waits out the whole timeout.
    command: `npm run build:mock && npm run preview -- --host ${HOST} --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: !CI,
    timeout: 120_000,
    // Without this the build and server output is swallowed, and a failure here
    // looks like nothing but a timeout.
    stdout: "pipe",
    stderr: "pipe",
  },
});

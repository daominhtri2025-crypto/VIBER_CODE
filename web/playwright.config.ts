import { defineConfig, devices } from "@playwright/test";

/** E2E against a running stack: API on :8000 (demo DB, mock AI) and `next start` on :3000.
 *  See e2e/README.md for the exact commands (scripts/e2e.sh does it all). */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure", locale: "vi-VN" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});

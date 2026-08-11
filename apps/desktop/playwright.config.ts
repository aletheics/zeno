import { defineConfig } from "@playwright/test";

/**
 * Electron E2E for the Zeno desktop UI.
 * Workers must stay at 1 — each test launches a full Electron + utility Host.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    trace: "off",
    screenshot: "only-on-failure",
  },
});

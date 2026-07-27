import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:3217";
const DEMO_SETUP_TEST = /demo-setup\.setup\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // The setup project owns the one intentionally single-use demo claim.
  // Retrying it against the same process would no longer start from the state
  // the test is meant to prove.
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  // One worker plus explicit project dependencies keeps the in-memory demo
  // state deterministic: setup mutates once, viewport projects only read it.
  workers: 1,
  projects: [
    {
      name: "demo-setup",
      testMatch: DEMO_SETUP_TEST,
      use: {
        browserName: "chromium",
        viewport: { height: 1_024, width: 1_536 },
      },
    },
    {
      dependencies: ["demo-setup"],
      name: "desktop-chromium",
      testIgnore: DEMO_SETUP_TEST,
      use: {
        browserName: "chromium",
        viewport: { height: 1_024, width: 1_536 },
      },
    },
    {
      dependencies: ["demo-setup"],
      name: "iphone-webkit",
      testIgnore: DEMO_SETUP_TEST,
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { height: 844, width: 390 },
      },
    },
  ],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3217",
    env: {
      NEXT_PUBLIC_APP_URL: BASE_URL,
      YGF_DEMO_MODE: "true",
      YGF_PUBLIC_ORIGIN: BASE_URL,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: BASE_URL,
  },
});

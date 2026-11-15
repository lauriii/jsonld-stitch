import { defineConfig } from "vitest/config";

// Builds and serves examples/app-router: one server and one browser at a time.
export default defineConfig({
  test: {
    include: ["test/e2e.test.ts"],
    globalSetup: ["test/e2e.setup.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 600_000,
  },
});

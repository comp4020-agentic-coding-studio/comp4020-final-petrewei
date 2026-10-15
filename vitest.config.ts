import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. test/ holds unit tests of the server's own modules, which need no
// running app. A test anywhere else needs adding to `include`.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    // The files share one pair of markets, and one file's round is another's,
    // so they run one after another.
    fileParallelism: false,
    // A round waits for Start and then a ten-second countdown before
    // trading opens, so a check that trades takes longer than the default.
    testTimeout: 30_000,
  },
});

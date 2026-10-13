import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. test/ holds unit tests of the server's own modules, which need no
// running app. A test anywhere else needs adding to `include`.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    // The files share one door, and a word one file holds is refused to
    // another, so they run one after another.
    fileParallelism: false,
  },
});

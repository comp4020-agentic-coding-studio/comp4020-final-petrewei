import { expect, it } from "vitest";
import { baseUrl } from "./helpers.ts";

// ADR 0007: the activity log shows who took whose word by short code, so it
// is the operator's alone. Without the server's STATS_KEY, the page and its
// data answer 404, as if they did not exist. Read-only, so it runs against
// the live door too. test/stats.test.ts checks what the key opens.
it("keeps the activity log from visitors", async () => {
  for (const path of ["/stats", "/stats.js", "/api/stats", "/api/stats?key=guess"]) {
    expect((await fetch(new URL(path, baseUrl))).status, path).toBe(404);
  }
});

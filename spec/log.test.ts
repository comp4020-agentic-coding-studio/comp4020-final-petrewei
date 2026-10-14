import { expect, it } from "vitest";
import { baseUrl } from "./helpers.ts";

// The activity log shows who did what by short code, so it is the
// operator's alone. Without the server's STATS_KEY the page and its data
// answer 404, as if they did not exist. Read-only, so it runs against the
// live app too; test/log.test.ts checks what the key opens.
it("keeps the activity log from visitors", async () => {
  for (const path of ["/log", "/log.js", "/api/log", "/api/log?key=guess"]) {
    expect((await fetch(new URL(path, baseUrl))).status, path).toBe(404);
  }
});

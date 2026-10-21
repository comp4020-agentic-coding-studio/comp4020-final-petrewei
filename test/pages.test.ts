import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

// The checks never run the page's own scripts, so a script that cannot
// even load, such as one declaring the same name twice, would pass them
// all and leave a blank market. Each is parsed here as the module the
// browser loads.
it("parses every page script as a module", () => {
  for (const file of readdirSync("public").filter((f) => f.endsWith(".js"))) {
    const run = spawnSync("node", ["--check", "--input-type=module"], { input: readFileSync(`public/${file}`) });
    expect(run.stderr.toString(), file).toBe("");
    expect(run.status, file).toBe(0);
  }
});

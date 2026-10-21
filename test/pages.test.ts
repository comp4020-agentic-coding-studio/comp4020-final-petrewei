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

// The chart once wore a filename (chart_replay_????-??-??.exe) as a
// joke; Peter asked for no file names or extensions on the page.
it("shows no file names or extensions on the page", () => {
  const shown = ["public/index.html", "public/app.js", "public/i18n.js", "public/i18n-long.js", "public/about.js"].map((f) => readFileSync(f, "utf8")).join("\n");
  // strings in quotes or text between tags that end in a file extension
  const leaks = [...shown.matchAll(/["'`>]([^"'`<>\s]*\.(?:exe|bat|dll|txt|csv|log|dat|bin|sys))\b/gi)].map((m) => m[1]);
  expect(leaks).toEqual([]);
});

// The page script finds its elements by id; a renamed or removed element
// makes $() return null and throws mid-render, which no server check sees.
// Every id the script asks for must be on the page, or made by a script.
it("finds every element the page script asks for by id", () => {
  const html = readFileSync("public/index.html", "utf8");
  const scripts = ["public/app.js", "public/tips.js"].map((f) => readFileSync(f, "utf8")).join("\n");
  const asked = new Set([...readFileSync("public/app.js", "utf8").matchAll(/\$\("([\w-]+)"\)/g)].map((m) => m[1]));
  const made = new Set([...scripts.matchAll(/id: "([\w-]+)"/g)].map((m) => m[1]));
  expect(asked.size).toBeGreaterThan(40);
  for (const id of asked) expect(html.includes(`id="${id}"`) || made.has(id), id).toBe(true);
});

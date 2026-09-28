#!/usr/bin/env node
// Checks what would otherwise be silently wrong in the process evidence:
// CLAUDE.md missing, no crit reflection under a name the cutoff sweep reads,
// PROCESS.md still carrying its template comment, or a cited commit that
// doesn't exist in this repo (a citation is a markdown link whose text is an
// abbreviated SHA or a sha...sha range). How the account is told, and how much
// it cites, is the marker's to judge.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

// each crit's cutoff reads its own; any one passes here
const REFLECTIONS = ["crit-8.md", "crit-9.md", "crit-10.md"];

let failed = false;
const fail = (msg: string): void => {
  console.error(`✗ ${msg}`);
  failed = true;
};

if (!existsSync("CLAUDE.md")) {
  fail("no CLAUDE.md in the repo root — the harness is part of what's marked");
}

const reflections = existsSync("reflections") ? readdirSync("reflections") : [];
for (const f of reflections) {
  if (f.endsWith(".md") && f !== "README.md" && !REFLECTIONS.includes(f)) {
    console.warn(`! reflections/${f} isn't a name the cutoff sweep reads`);
  }
}
const found = REFLECTIONS.filter((name) => reflections.includes(name));
if (found.length > 0) {
  console.log(`✓ reflections/${found.join(", reflections/")}`);
} else {
  fail(`no reflection — each crit's cutoff reads its own: ${REFLECTIONS.join(", ")}`);
}

if (!existsSync("PROCESS.md")) {
  fail("no PROCESS.md in the repo root");
  process.exit(1);
}

const src = readFileSync("PROCESS.md", "utf8");

if (src.includes("TEMPLATE:")) {
  fail("PROCESS.md still contains the template comment — replace it with your own account");
}

const shas = new Set<string>();
for (const match of src.matchAll(/\[`?([0-9a-f]{7,40}(?:\.\.\.[0-9a-f]{7,40})?)`?\]\(/g)) {
  for (const sha of match[1].split("...")) shas.add(sha);
}

for (const sha of shas) {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" });
  } catch {
    fail(`cited commit ${sha} doesn't exist in this repo`);
  }
}

if (failed) process.exit(1);
console.log(
  shas.size > 0
    ? `✓ PROCESS.md: ${shas.size} cited commit(s), all resolve`
    : "✓ PROCESS.md: no commit links to check",
);

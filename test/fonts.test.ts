import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// The fonts. Apple and Android phones carry good Japanese, Chinese and
// Korean faces; Windows and Linux fall back to whatever is installed,
// often a mismatched or bitmap-looking one. So every text stack ends in
// open web fonts (Noto Sans JP, SC and KR, OFL) that cover all three
// scripts before any system font, the mono one included, since prices
// carry 円, 日元 and 秒. Each language puts its own Noto first, so a
// character shared by the scripts is drawn in that language's form.
const css = readFileSync("public/app.css", "utf8");
const server = readFileSync("src/server.ts", "utf8");
const page = readFileSync("public/index.html", "utf8");
const CJK = ["Noto Sans JP", "Noto Sans SC", "Noto Sans KR"];
const stacks = (name: string): string[] => [...css.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))].map((m) => m[1]);
const families = (stack: string): string[] => stack.split(",").map((f) => f.trim().replace(/^"|"$/g, ""));
const generic = new Set(["system-ui", "sans-serif", "monospace", "ui-monospace", "serif"]);

it("ends every text stack in web fonts for all three scripts, before any system font", () => {
  const all = [...stacks("round"), ...stacks("mono")];
  expect(all.length).toBeGreaterThanOrEqual(4);
  for (const stack of all) {
    const f = families(stack);
    for (const cjk of CJK) expect(f, stack).toContain(cjk);
    // nothing but web fonts before the last Noto
    const last = Math.max(...CJK.map((c) => f.indexOf(c)));
    for (const name of f.slice(0, last)) expect(generic.has(name) || /JetBrains Mono|M PLUS Rounded 1c|Noto Sans/.test(name), `${name} in ${stack}`).toBe(true);
  }
});

it("puts each language's own Noto first", () => {
  for (const [lang, first] of [["ja", "Noto Sans JP"], ["zh-CN", "Noto Sans SC"], ["ko", "Noto Sans KR"]]) {
    const rule = css.match(new RegExp(`:root:lang\\(${lang}\\)\\s*\\{([^}]+)\\}`))?.[1] ?? "";
    for (const name of ["round", "mono"]) {
      const stack = rule.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
      expect(stack, `${lang} --${name}`).toBeDefined();
      expect(families(stack!).filter((f) => CJK.includes(f))[0], `${lang} --${name}`).toBe(first);
    }
  }
});

it("loads the same web fonts on every page, in normal and bold", () => {
  const link = server.match(/const FONTS = `([^`]+)`/)?.[1] ?? "";
  for (const family of ["JetBrains+Mono", "M+PLUS+Rounded+1c", "Noto+Sans+JP", "Noto+Sans+SC", "Noto+Sans+KR"]) expect(link, family).toMatch(new RegExp(`family=${family.replaceAll("+", "\\+")}:wght@400;[^&]*700`));
  expect(link).toContain("display=swap");
  // the market page takes the same link, not a copy of it
  expect(page).toContain("{{fonts}}");
  expect(page).not.toContain("fonts.googleapis.com/css2");
});

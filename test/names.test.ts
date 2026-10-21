import { describe, expect, it } from "vitest";
import { BOTS } from "../src/bots.ts";
import { LANGS, T } from "../public/i18n.js";
import { drawn, FAMILY, GIVEN } from "../public/names.js";

// ADR 0018: drawn names are anime-style, family name first, with a form
// in each language; the house traders are the comic's characters, by
// full name, never Kurumi's father or mother.
describe("drawn names", () => {
  it("has 24 family and 24 given names, each in every language", () => {
    expect(FAMILY).toHaveLength(24);
    expect(GIVEN).toHaveLength(24);
    for (const part of [...FAMILY, ...GIVEN]) {
      expect(part.en, JSON.stringify(part)).toMatch(/^[A-Z][a-z]+$/);
      expect(part.ja, JSON.stringify(part)).not.toBe("");
      // Chinese readers get characters, never Japanese kana
      expect(part.zh, JSON.stringify(part)).toMatch(/^[一-鿿]+$/);
    }
  });

  it("gives 576 different names in each language", () => {
    for (const lang of LANGS) {
      const all = new Set(FAMILY.flatMap((_, f) => GIVEN.map((_, g) => drawn(lang, [f, g]))));
      expect(all.size, lang).toBe(576);
    }
  });

  it("writes them as each language does", () => {
    const i = FAMILY.findIndex((f) => f.en === "Dojima");
    const j = GIVEN.findIndex((g) => g.en === "Hikari");
    expect(drawn("en", [i, j])).toBe("Dojima Hikari");
    expect(drawn("ja", [i, j])).toBe("堂島ひかり");
    expect(drawn("zh", [i, j])).toBe("堂岛光");
  });

  it("never draws a house trader's name, or part of one", () => {
    const theirs = LANGS.flatMap((l) => Object.values(T[l].bots).flatMap((b) => [b.name, ...b.name.split(" ")]));
    for (const part of [...FAMILY, ...GIVEN]) for (const form of Object.values(part)) expect(theirs, form).not.toContain(form);
  });
});

describe("the house traders", () => {
  it("are at least seven of the comic's characters, by family and given name", () => {
    expect(BOTS.length).toBeGreaterThanOrEqual(7);
    for (const b of BOTS) expect(b.name, b.id).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(BOTS.map((b) => b.name)).toEqual(expect.arrayContaining(["Fukuga Kurumi", "Kogane Mochiko", "Yamashi Mebuki", "Takane Yasuko"]));
  });

  it("never include Kurumi's father or mother, in any language", () => {
    const names = LANGS.flatMap((l) => Object.values(T[l].bots).map((b) => `${b.name} ${b.motto}`)).join(" ");
    for (const banned of ["Ikuo", "Kozue", "郁夫", "梢", "Dad", "パパ", "父", "母", "老爹", "妈"]) expect(names, banned).not.toContain(banned);
  });
});

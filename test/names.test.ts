import { describe, expect, it } from "vitest";
import { BOTS } from "../src/bots.ts";
import { LANGS, T } from "../public/i18n.js";
import { drawn, GIVEN } from "../public/names.js";

// ADR 0038: a trader goes by a given name alone, drawn or a house trader's,
// with a form in each language; the house traders are the comic's
// characters, never Kurumi's father or mother.
describe("drawn names", () => {
  it("has given names only, each in every language", () => {
    expect(GIVEN.length).toBeGreaterThanOrEqual(100);
    for (const part of GIVEN) {
      expect(part.en, JSON.stringify(part)).toMatch(/^[A-Z][a-z]+$/);
      expect(part.ja, JSON.stringify(part)).not.toBe("");
      // Chinese readers get characters, never Japanese kana
      expect(part.zh, JSON.stringify(part)).toMatch(/^[一-鿿]+$/);
    }
  });

  it("gives a different name to each draw in every language", () => {
    for (const lang of LANGS) expect(new Set(GIVEN.map((_, g) => drawn(lang, g))).size, lang).toBe(GIVEN.length);
  });

  it("never lets one language's form be another draw's in any language", () => {
    const seen = new Map<string, number>();
    for (const [g, part] of GIVEN.entries()) for (const form of Object.values(part)) {
      const key = form.toLowerCase();
      expect(seen.get(key) ?? g, key).toBe(g);
      seen.set(key, g);
    }
  });

  it("writes them as each language does", () => {
    const g = GIVEN.findIndex((x) => x.en === "Hikari");
    expect(drawn("en", g)).toBe("Hikari");
    expect(drawn("ja", g)).toBe("ひかり");
    expect(drawn("zh", g)).toBe("光");
  });

  it("never draws a house trader's name", () => {
    const theirs = LANGS.flatMap((l) => Object.values(T[l].bots).map((b) => b.name));
    for (const part of GIVEN) for (const form of Object.values(part)) expect(theirs, form).not.toContain(form);
  });
});

describe("the house traders", () => {
  it("are at least seven of the comic's characters, by given name alone, in every language", () => {
    expect(BOTS.length).toBeGreaterThanOrEqual(7);
    for (const b of BOTS) expect(b.name, b.id).toMatch(/^[A-Z][a-z]+$/);
    expect(BOTS.map((b) => b.name)).toEqual(expect.arrayContaining(["Kurumi", "Mochiko", "Mebuki", "Yasuko"]));
    for (const l of LANGS) for (const b of BOTS) expect(T[l].bots[b.id].name, `${l} ${b.id}`).not.toMatch(/\s/);
  });

  it("never include Kurumi's father or mother, in any language", () => {
    const names = LANGS.flatMap((l) => Object.values(T[l].bots).map((b) => `${b.name} ${b.motto}`)).join(" ");
    for (const banned of ["Ikuo", "Kozue", "郁夫", "梢", "Dad", "パパ", "父", "母", "老爹", "妈"]) expect(names, banned).not.toContain(banned);
  });
});

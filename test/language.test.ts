import { expect, it } from "vitest";
import { LANGS, languageFor } from "../src/pages.ts";

// The bare address shows the language chosen in Settings, else the browser's, else English (ADR 0099). It is read from
// the `lang` cookie and the Accept-Language header alone, so it is a plain function of two strings.
it("takes the chosen language first, then the browser's, then English", () => {
  expect(languageFor("ja", "zh-CN,zh;q=0.9"), "a choice beats the browser").toBe("ja");
  expect(languageFor(undefined, "zh-CN,zh;q=0.9,en;q=0.8"), "no choice: the browser's first language").toBe("zh");
  expect(languageFor(undefined, undefined), "nothing at all").toBe("en");
  expect(languageFor(undefined, ""), "an empty header").toBe("en");
});

it("falls to English for a language the game does not have", () => {
  expect(languageFor(undefined, "fr-FR,fr;q=0.9"), "French").toBe("en");
  expect(languageFor(undefined, "ko,en;q=0.5"), "Korean is first but unknown, English is listed").toBe("en");
  expect(languageFor("fr", "ja"), "a cookie that names no language of ours is ignored, so the browser decides").toBe("ja");
});

it("reads a browser's list in the order of its preference, regions and weights included", () => {
  expect(languageFor(undefined, "en;q=0.5, ja;q=0.9"), "a higher weight wins over order").toBe("ja");
  expect(languageFor(undefined, "ja-JP"), "a region of a language we have").toBe("ja");
  expect(languageFor(undefined, "zh-TW,zh;q=0.8"), "Traditional Chinese reads as Chinese").toBe("zh");
  expect(languageFor(undefined, "JA"), "case does not matter").toBe("ja");
  expect(languageFor(undefined, "fr;q=0.9, zh;q=0.1"), "a lower-weight language of ours is used when nothing better is ours").toBe("zh");
});

it("skips a tag whose weight is not a number between 0 and 1, rather than reading it as full weight", () => {
  expect(languageFor(undefined, "ja;q=abc, zh;q=0.5"), "junk first, a good one after").toBe("zh");
  expect(languageFor(undefined, "ja;q=5, zh;q=0.5"), "a weight over 1").toBe("zh");
  expect(languageFor(undefined, "ja;q=0, zh;q=0.5"), "a weight of 0 means not acceptable").toBe("zh");
  expect(languageFor(undefined, "ja;q=-1, zh;q=0.5"), "a negative weight").toBe("zh");
  expect(languageFor(undefined, "ja;q=abc"), "junk alone falls to English").toBe("en");
});

it("is never moved by junk", () => {
  for (const header of ["*", ";;;", "ja;q=abc", "ja;q=", "x".repeat(5000), "ja,".repeat(500)]) expect(LANGS, header.slice(0, 12)).toContain(languageFor(undefined, header));
  for (const cookie of ["", "ja ", "<script>", "../zh", "zh;ja", "JA"]) expect(LANGS, cookie).toContain(languageFor(cookie, undefined));
  expect(languageFor("ja ", undefined), "a cookie is the exact code or nothing").toBe("en");
});

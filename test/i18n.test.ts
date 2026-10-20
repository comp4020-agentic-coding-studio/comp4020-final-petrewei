import { describe, expect, it } from "vitest";
import { BOTS } from "../src/bots.ts";
import { EVENTS } from "../src/market.ts";
import { LESSONS } from "../src/tutorial.ts";
import { english, LANGS, T } from "../public/i18n.js";

english(LESSONS, EVENTS);

// The page is English, Japanese or Chinese. Every string the page shows,
// every message the server sends, every lesson, bot and famous day must
// exist in all three, or a reader would meet a stray English line.
const keys = (o: object): string[] => Object.keys(o).sort();

describe("the translations", () => {
  it("offers English, Japanese and Simplified Chinese", () => {
    expect(LANGS).toEqual(["en", "ja", "zh"]);
  });

  it("has every page string, message and refusal in every language", () => {
    for (const lang of LANGS) {
      for (const part of ["ui", "news", "refusals"] as const) {
        expect(keys(T[lang][part]), `${lang}.${part}`).toEqual(keys(T.en[part]));
        for (const [k, v] of Object.entries(T[lang][part])) expect(v, `${lang}.${part}.${k}`).not.toBe("");
      }
    }
  });

  it("names every bot and translates every motto", () => {
    for (const lang of LANGS) for (const b of BOTS) expect(T[lang].bots[b.id], `${lang} ${b.id}`).toMatchObject({ name: expect.any(String), motto: expect.any(String) });
  });

  it("translates every lesson's title, text and task", () => {
    for (const lang of LANGS) for (const l of LESSONS) expect(T[lang].lessons[l.id], `${lang} ${l.id}`).toMatchObject({ title: expect.any(String), text: expect.any(String), task: expect.any(String) });
  });

  it("tells every famous day in every language", () => {
    for (const lang of LANGS) for (const e of EVENTS) expect(T[lang].events[e.date], `${lang} ${e.date}`).toMatchObject({ title: expect.any(String), note: expect.any(String) });
  });

  it("has every refusal the server can send", async () => {
    // the desk's, the markets' and the tutorial's refusals, by their English
    const { readFileSync } = await import("node:fs");
    const src = ["src/fx.ts", "src/server.ts", "src/tutorial.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
    const sent = [...src.matchAll(/(?:return|only\([^,]+,|\?\s*null\s*:)\s*"([A-Z][^"]+[.!?])"/g)].map((m) => m[1]);
    expect(sent.length).toBeGreaterThan(15);
    for (const text of sent) expect(Object.keys(T.en.refusals), text).toContain(text);
  });

  it("fills a template's values into each language", async () => {
    const { news } = await import("../public/i18n.js");
    expect(news("ja", { key: "bought", args: { who: "X", lev: 25 } }, () => "くるみ")).toBe("くるみが25倍で買い");
    expect(news("zh", { key: "bought", args: { who: "X", lev: 25 } }, () => "久留美")).toContain("久留美");
  });
});

// A translation that drops a slot drops an amount or a name from the
// page, which a reader would never notice was missing.
it("keeps every slot of every template in every language", () => {
  const slots = (text: string): string[] => [...text.matchAll(/\{(\w+\+?)\}/g)].map((m) => m[1]).sort();
  for (const lang of LANGS) {
    for (const part of ["ui", "news"] as const) {
      for (const [k, en] of Object.entries(T.en[part])) {
        if (typeof en !== "string") continue;
        expect(slots(T[lang][part][k] as string), `${lang}.${part}.${k}`).toEqual(slots(en));
      }
    }
  }
});

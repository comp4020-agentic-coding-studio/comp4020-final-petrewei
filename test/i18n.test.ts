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
        // Chinese joins the title with nothing, after a full-width "！".
        for (const [k, v] of Object.entries(T[lang][part])) if (k !== "titleJoin") expect(v, `${lang}.${part}.${k}`).not.toBe("");
      }
    }
  });

  it("has the same number of prayers in every language", () => {
    for (const lang of LANGS) {
      expect(T[lang].prayers.length, lang).toBe(T.en.prayers.length);
      expect(T[lang].prayers.length, lang).toBeGreaterThanOrEqual(6);
      for (const p of T[lang].prayers) expect(p, lang).not.toBe("");
      expect(keys(T[lang].pops), lang).toEqual(keys(T.en.pops));
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
    // a name's refusals carry their status alongside
    sent.push(...[...src.matchAll(/error: "([A-Z][^"]+[.!?])", status:/g)].map((m) => m[1]));
    expect(sent.length).toBeGreaterThan(20);
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

// Different languages must not change the layout: each slot is sized for
// the longest language, and a translation that outgrows it would be cut.
// Widths here are in Latin-character units; a full-width Japanese or
// Chinese character counts as two. The budgets were measured in a browser
// against the slots in public/app.css (see PROCESS.md).
const width = (text: string): number => [...text].reduce((n, ch) => n + (/[⺀-鿿＀-￯　-〿]/.test(ch) ? 2 : 1), 0);
const BUDGET: Record<string, number> = { warnClose: 16, logo: 12, replay: 16, simulation: 16, tutorial: 16, sub: 30, spread: 34, leverage: 18, stake: 18, stakeNote: 28, netWorth: 14, pnl: 14, level: 14, meterKey: 50, pray: 34, start: 16, next: 14, restart: 14, clockLobby: 20, clockClosed: 20, clockTutorial: 20 };

it("keeps every fixed-width label inside its slot in every language", () => {
  for (const lang of LANGS) {
    for (const [k, max] of Object.entries(BUDGET)) {
      const text = T[lang].ui[k].replace(/\{\w+\}/g, "000");
      expect(width(text), `${lang}.ui.${k} "${text}"`).toBeLessThanOrEqual(max);
    }
  }
});

// ADR 0031: the house traders speak in character. A bot's bubble, at each
// moment a pop marks, is one of its own lines, in every language; a bot
// with nothing to say for a moment falls back to the plain pop.
describe("the bots' lines", () => {
  const MOMENTS = ["wild", "add", "win", "loss", "call", "stopout", "zerocut", "borrow", "pray"];
  it("give every bot lines for every moment, in every language", async () => {
    const { BOTS } = await import("../src/bots.ts");
    for (const lang of LANGS) {
      for (const b of BOTS) {
        const lines = T[lang].lines?.[b.id];
        expect(lines, `${lang} ${b.id}`).toBeDefined();
        for (const m of MOMENTS) {
          expect(lines[m], `${lang} ${b.id} ${m}`).toEqual(expect.any(Array));
          expect(lines[m].length, `${lang} ${b.id} ${m}`).toBeGreaterThanOrEqual(1);
          for (const l of lines[m]) expect(l.length, `${lang} ${b.id} ${m}`).toBeGreaterThan(1);
        }
      }
    }
  });

  it("keep the same bots and moments in every language", () => {
    const shape = (lang: string) => Object.fromEntries(Object.entries(T[lang].lines).map(([b, m]) => [b, Object.keys(m as object).sort()]));
    for (const lang of LANGS) expect(shape(lang), lang).toEqual(shape("en"));
  });
});

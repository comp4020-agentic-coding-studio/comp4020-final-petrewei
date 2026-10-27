import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { ICONS, PROPS, prop } from "../public/art.js";
import { LANGS, T } from "../public/i18n.js";

// ADR 0025: tips and pictures. Every control on the market says what it
// does when hovered or focused, in each language, in a tip that shows at
// once rather than the browser's slow title; details such as your code
// live in tips, not in the line; feed lines and pop-ups each wear an
// icon; and a few pixel-art props, drawn like the faces, mark moments.
const page = new JSDOM(readFileSync("public/index.html", "utf8")).window.document;
const tips = [...page.querySelectorAll("[data-tip]")].map((el) => (el as HTMLElement).dataset.tip!);

it("gives every control on the market a tip, in every language", () => {
  const controls = [...page.querySelectorAll("button, input, select, a.icon, [role=switch]")].filter((el) => !el.closest("dialog, #name-box"));
  for (const el of controls) {
    // a key, or text the page script fills in (such as your code)
    const named = el.closest("[data-tip], [data-tip-text]") as HTMLElement | null;
    expect(named, el.outerHTML.slice(0, 80)).not.toBeNull();
  }
  expect(tips.length).toBeGreaterThanOrEqual(20);
  for (const lang of LANGS) for (const k of tips) expect(T[lang].tips?.[k], `${lang}.tips.${k}`).toEqual(expect.any(String));
});

it("uses tips, not the browser's title, for the market's controls", () => {
  expect(page.querySelectorAll("[data-t-title]").length).toBe(0);
  // the tab's own title (document.title) is the page's name, not a tip
  expect(readFileSync("public/app.js", "utf8").replaceAll("document.title", "")).not.toMatch(/\.title = /);
});

it("keeps the same tips in every language", () => {
  const keys = (o: object) => Object.keys(o).sort();
  for (const lang of LANGS) expect(keys(T[lang].tips), lang).toEqual(keys(T.en.tips));
});

it("makes ironman a switch, its explanation a tip", () => {
  const sw = page.querySelector("#ironman")!;
  expect(sw.getAttribute("role")).toBe("switch");
  expect(sw.getAttribute("aria-checked")).toBe("false");
  for (const lang of LANGS) expect(T[lang].ui.ironman, lang).not.toMatch(/paus|一時停止|暂停/i);
});

it("gives every feed line and pop-up an icon", () => {
  // a tutorial's "you-" line wears its plain kind's icon
  for (const k of Object.keys(T.en.news)) expect(ICONS.news[k.replace(/^you-/, "")], `news ${k}`).toEqual(expect.any(String));
  for (const k of Object.keys(T.en.pops)) expect(ICONS.pops[k], `pop ${k}`).toEqual(expect.any(String));
});

it("draws each prop as a 16-by-16 grid of known colours, as pixels only", () => {
  expect(Object.keys(PROPS).length).toBeGreaterThanOrEqual(5);
  for (const [id, { colors, rows }] of Object.entries(PROPS)) {
    expect(rows, id).toHaveLength(16);
    for (const row of rows) {
      expect(row, id).toHaveLength(16);
      for (const ch of row.replaceAll(".", "")) expect(ch in colors || "kw".includes(ch), `${id}: ${ch}`).toBe(true);
    }
    const s = prop(id, 32);
    expect(s).toMatch(/^<svg [^>]*viewBox="0 0 16 16" width="32" height="32" shape-rendering="crispEdges"/);
    expect(s.replace(/^<svg[^>]*>|<\/svg>$/g, "").replace(/<rect x="\d+" y="\d+" width="\d+" height="1" fill="#[0-9a-f]{6}"\/>/g, "")).toBe("");
  }
  expect(prop("nope")).toBe("");
});

// The tip script is served, and every module the page imports is checked
// to be served by spec/languages.test.ts.
it("loads the tip script with the page", () => {
  expect(readFileSync("public/app.js", "utf8")).toMatch(/from "\/tips\.js"/);
  expect(readFileSync("src/server.ts", "utf8")).toMatch(/"\/tips\.js": \[read\("public\/tips\.js"\)/);
});

// ADR 0034: the ticket's stop loss and take profit each have their own
// toggle, the stop loss on the left and the take profit on the right, over
// one joined track with a thumb for each. Both are always shown, grey when
// their toggle is off, and show a percentage only.
const appCss = readFileSync("public/app.css", "utf8");
it("gives the stop loss and the take profit a toggle each, one on the left and one on the right, over one joined track", () => {
  const exits = page.querySelector("#exits")!;
  expect(exits).not.toBeNull();
  // stop loss first in the page, so on the left; take profit after, on the right
  expect([...exits.querySelectorAll("[role=switch]")].map((s) => s.id)).toEqual(["sl-on", "tp-on"]);
  expect(appCss).toMatch(/\.exit-heads \.sl \{[^}]*justify-self: start/);
  expect(appCss).toMatch(/\.exit-heads \.tp \{[^}]*justify-self: end/);
  // one track, both thumbs on it, never hidden by a toggle
  expect(exits.querySelectorAll(".exit-track")).toHaveLength(1);
  const thumbs = [...exits.querySelectorAll(".exit-track input[type=range]")] as HTMLInputElement[];
  expect(thumbs.map((t) => t.id)).toEqual(["sl-dist", "tp-dist"]);
  for (const t of thumbs) expect(t.hasAttribute("hidden"), t.id).toBe(false);
  // a percentage for each, in the toggle itself, and no amount of yen
  expect(exits.querySelector("#sl-on #sl-pct")).not.toBeNull();
  expect(exits.querySelector("#tp-on #tp-pct")).not.toBeNull();
  expect(exits.querySelector("#sl-out, #tp-out")).toBeNull();
});

it("never abbreviates stop loss or take profit in any language", () => {
  const abbrev = /\b(SL|TP)\b|S\/L|T\/P/;
  for (const lang of LANGS) {
    for (const part of ["ui", "tips"] as const) {
      for (const [k, v] of Object.entries(T[lang][part] as Record<string, unknown>)) {
        if (typeof v === "string") expect(v, `${lang}.${part}.${k}`).not.toMatch(abbrev);
      }
    }
  }
  const html = page.body.textContent ?? "";
  expect(html).not.toMatch(abbrev);
  expect(readFileSync("src/tutorial.ts", "utf8")).not.toMatch(abbrev);
  // the tutorial's lessons and its refusals, in every language
  for (const lang of LANGS) {
    for (const [id, l] of Object.entries(T[lang].lessons ?? {})) expect(JSON.stringify(l), `${lang} lesson ${id}`).not.toMatch(abbrev);
    for (const [k, v] of Object.entries(T[lang].refusals)) expect(v, `${lang} refusal ${k}`).not.toMatch(abbrev);
  }
});

// ADR 0037: a position's exits are the ticket's two toggles and one track,
// under the position row, and English names them in capitals.
it("puts a toggle and a thumb for each exit under the position row, outside its table", () => {
  const table = page.querySelector(".positions table")!;
  expect(table.querySelector("#psl-on, #ptp-on, #psl-dist, #ptp-dist")).toBeNull();
  const box = page.querySelector(".positions #pexits")!;
  for (const id of ["psl-on", "ptp-on", "psl-dist", "ptp-dist", "psl-fill", "ptp-fill"]) expect(box.querySelector("#" + id), id).not.toBeNull();
  expect(page.querySelector("#exit-box, #stop, #take")).toBeNull();
});
it("writes Stop Loss and Take Profit in capitals wherever English reads them", () => {
  const src = readFileSync("public/i18n.js", "utf8");
  const en = src.slice(src.indexOf("\n  en: {"), src.indexOf("\n  ja: {"));
  expect(en).not.toMatch(/\b[Ss]top loss|\b[Tt]ake profit/);
  expect(en).toContain("Stop Loss");
  expect(en).toContain("Take Profit");
});

// ADR 0038: the name box carries its own language, music and theme controls
// at its top right, and a newcomer's two ways to begin below; names are the
// given name alone, with no "You are"; and a tip sits in the top layer so a
// dialog never covers it.
it("has language, music and theme tools in the name box, above its title, and two ways to begin below", () => {
  const box = page.querySelector("#name-box")!;
  const form = box.querySelector("form")!;
  for (const id of ["n-lang", "n-music", "n-theme"]) expect(box.querySelector("#" + id), id).not.toBeNull();
  const kids = [...form.children];
  expect(kids.findIndex((e) => e.classList.contains("name-tools"))).toBeLessThan(kids.findIndex((e) => e.id === "name-title"));
  const first = box.querySelector("#name-first")!;
  // the tutorial on the left, free play on the right
  expect([...first.querySelectorAll("button")].map((b) => b.getAttribute("value"))).toEqual(["tutorial", "replay"]);
  expect(kids.indexOf(first)).toBeGreaterThan(kids.findIndex((e) => e.classList.contains("name-row") || e.id === "name-error"));
});
it("says the name alone, never 'You are', in any language", () => {
  const src = readFileSync("public/i18n.js", "utf8");
  expect(src).not.toMatch(/youAre/);
  expect(readFileSync("public/app.js", "utf8")).not.toMatch(/youAre/);
});
it("shows a tip in the top layer, over any dialog", () => {
  const src = readFileSync("public/tips.js", "utf8");
  expect(src).toMatch(/popover\s*=\s*"manual"/);
  expect(src).toMatch(/showPopover/);
});

// ADR 0039: a round's controls sit in the quote line between the price and
// the clock, Ironman to the right of Start, the ticket has a header, panels
// with a heading fold, the language is a globe alone, and the footer spans
// the page.
it("puts pause, leave and end in the quote line, between the price and the clock", () => {
  const quote = page.querySelector(".quote")!;
  const order = [...quote.children].map((e) => e.id || e.className);
  expect(order.indexOf("round-ctl")).toBeGreaterThan(order.indexOf("price"));
  expect(order.indexOf("round-ctl")).toBeLessThan(order.indexOf("clock"));
  expect([...quote.querySelectorAll("#round-ctl button")].map((b) => b.id)).toEqual(["pause", "leave", "finish"]);
  expect(page.querySelectorAll("#pause, #leave, #finish")).toHaveLength(3);
  expect(page.querySelector(".ticket #pause, .ticket #leave, .ticket #finish")).toBeNull();
});
it("puts Ironman below Start, and only one line of text and a note in the lobby", () => {
  const go = page.querySelector(".lobby-go")!;
  expect([...go.children].map((e) => e.id)).toEqual(["start", "ironman"]);
  expect(readFileSync("public/app.css", "utf8")).toMatch(/\.lobby-go \{[^}]*flex-direction: column/);
  expect(T.en.ui.start).toBe("Start Round");
  const lobby = page.querySelector("#lobby")!;
  expect(lobby.querySelectorAll("p")).toHaveLength(3);
  expect(lobby.querySelector(".lobby-note")).not.toBeNull();
});
it("gives the ticket a heading, and lets headed panels fold", () => {
  expect(page.querySelector(".ticket > h2")?.textContent).toMatch(/\S/);
  expect([...page.querySelectorAll(".panel[data-fold]")].map((p) => (p as HTMLElement).dataset.fold).sort()).toEqual(["chart", "fame", "feed", "position", "room", "ticket"]);
  for (const p of page.querySelectorAll(".panel[data-fold]")) expect(p.querySelector(":scope > h2"), (p as HTMLElement).dataset.fold).not.toBeNull();
});
it("shows the language as a globe alone, and lets the footer take the page's width", () => {
  const css = readFileSync("public/app.css", "utf8");
  expect(css).toMatch(/\.lang select \{[^}]*opacity: 0/);
  expect(css.match(/\nfooter \{([^}]*)\}/)?.[1]).not.toMatch(/max-width/);
});
it("translates the lobby's line, note and the ticket's title in every language, each text on one line", () => {
  for (const lang of LANGS) {
    for (const k of ["lobbyReplayText", "lobbyScenarioText", "lobbyNote", "ticketTitle"]) expect(T[lang].ui[k], `${lang} ${k}`).toBeTruthy();
    for (const k of ["lobbyReplayText", "lobbyScenarioText"]) expect(T[lang].ui[k].length, `${lang} ${k}`).toBeLessThanOrEqual(36);
  }
});

// ADR 0040, 0043: on a narrow screen who you are shares the first row with
// the logo and the tools; the subtitle sits at the logo's right where it
// fits, and goes on a narrow phone so the name always shows.
it("keeps who you are on the first header row on a narrow screen, with the subtitle at the logo's right", () => {
  const css = readFileSync("public/app.css", "utf8");
  const narrow = css.slice(css.indexOf("@media (max-width: 900px)"), css.indexOf("@media (max-width: 560px)"));
  expect(narrow).toMatch(/\.top \{ grid-template-columns: minmax\(0, 1fr\) auto auto;/);
  expect(narrow).not.toMatch(/\.brand \{[^}]*flex-direction: column/);
  expect(narrow).toMatch(/\.whoami \{ grid-column: 2; grid-row: 1;/);
  expect(narrow).toMatch(/\.tools \{ grid-column: 3; grid-row: 1; \}/);
  expect(narrow).not.toMatch(/\.whoami \{[^}]*grid-row: 3/);
  expect(css).toMatch(/@media \(max-width: 419px\) \{ \.sub \{ display: none; \} \}/);
});
it("folds the chart's price line with the chart, and names the favicon's candlesticks and yen", () => {
  const css = readFileSync("public/app.css", "utf8");
  expect(css).not.toMatch(/chart-panel\.folded > \.quote/);
  const svg = readFileSync("public/favicon.svg", "utf8");
  expect(svg).not.toMatch(/<polyline/);
  expect(svg.match(/<rect /g)!.length).toBeGreaterThanOrEqual(4);
  expect(svg).toMatch(/<circle /);
});
it("breaks the Japanese subtitle after くるみちゃんの, and names Kurumi with ちゃん there", () => {
  expect(T.ja.ui.sub).toBe("くるみちゃんの FXファンタジー");
  expect(T.en.ui.sub).toBe("Kurumi's FX Fantasy");
  for (const lang of LANGS) expect(T[lang].ui.sub, lang).toMatch(/\S\s\S|白日梦/);
});

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
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
    // a key, or text the page script fills in (such as your code); an info
    // button is its own explanation (ADR 0049), carried in the info table
    const named = el.closest("[data-tip], [data-tip-text], [data-info]") as HTMLElement | null;
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
  expect([...page.querySelectorAll(".panel[data-fold]")].map((p) => (p as HTMLElement).dataset.fold).sort()).toEqual(["account", "chart", "fame", "feed", "position", "room", "ticket"]);
  for (const p of page.querySelectorAll(".panel[data-fold]")) expect(p.querySelector(":scope > h2"), (p as HTMLElement).dataset.fold).not.toBeNull();
});
it("shows the language as a globe alone, and lets the footer take the page's width", () => {
  const css = readFileSync("public/app.css", "utf8");
  expect(css).toMatch(/\.lang select \{[^}]*opacity: 0/);
  expect(css.match(/\nfooter \{([^}]*)\}/)?.[1]).not.toMatch(/max-width/);
});
it("translates the lobby's line, note and the ticket's title in every language, each text on one line", () => {
  for (const lang of LANGS) {
    for (const k of ["lobbyReplayText", "lobbySimulationText", "lobbyNote", "ticketTitle"]) expect(T[lang].ui[k], `${lang} ${k}`).toBeTruthy();
    for (const k of ["lobbyReplayText", "lobbySimulationText"]) expect(T[lang].ui[k].length, `${lang} ${k}`).toBeLessThanOrEqual(36);
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
it("folds the chart's price line with the chart", () => {
  expect(readFileSync("public/app.css", "utf8")).not.toMatch(/chart-panel\.folded > \.quote/);
});
// ADR 0043, 0045: the favicon is two candlesticks on nothing, one up in the
// page's green and one down in its red, the up one higher; no tile, no line
// graph, and no coin, which is lost at 16 pixels.
it("draws the favicon as one up and one down candle on a clear background", () => {
  const svg = readFileSync("public/favicon.svg", "utf8");
  const css = readFileSync("public/app.css", "utf8");
  const colour = (name: string) => css.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))![1];
  const bodies = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*fill="(#[0-9a-f]{6})"/g)];
  expect(bodies).toHaveLength(2);
  expect(svg).not.toMatch(/<polyline|<circle|<text|width="64" height="64"/);
  const [up, down] = bodies;
  expect(up[5]).toBe(colour("up"));
  expect(down[5]).toBe(colour("down"));
  expect(Number(up[2])).toBeLessThan(Number(down[2]));
  expect(Number(up[2]) + Number(up[4]) / 2).toBeLessThan(Number(down[2]) + Number(down[4]) / 2);
});
it("breaks the Japanese subtitle after くるみちゃんの, and names Kurumi with ちゃん there", () => {
  expect(T.ja.ui.sub).toBe("くるみちゃんの FXファンタジー");
  expect(T.en.ui.sub).toBe("Kurumi's FX Fantasy");
  for (const lang of LANGS) expect(T[lang].ui.sub, lang).toMatch(/\S\s\S|白日梦/);
});

// ADR 0044: English titles and headings are in Title Case: every word starts
// with a capital except the small ones (a, and, of, the, to ...), which stay
// lower-case unless first. Buttons and sentences are not headings and stay as
// they are.
const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "if", "in", "nor", "of", "off", "on", "or", "per", "so", "the", "to", "up", "via", "vs", "with", "into", "onto", "than"]);
const titleCase = (text: string): boolean => {
  const words = text.replace(/\{[^}]*\}\w*/g, "").split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  return words.every((w, i) => {
    const bare = w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (/^[A-Z]/.test(bare)) return true;
    return i > 0 && SMALL.has(bare);
  });
};
it("writes the English headings and titles in Title Case", () => {
  const keys = ["nameTitle", "nameWelcome", "chartTitle", "positionTitle", "ticketTitle", "feed", "fame", "room", "bell", "lobbyReplay", "lobbySimulation", "lobbyOpens", "thTrader", "thRounds", "thAvg", "thProfit", "thWins", "thBusts", "thPosition", "thEntry", "thNow", "thMargin", "yourTurn", "doneTitle", "guessLabel", "netWorth", "level", "indicators", "about"];
  for (const k of keys) expect(titleCase(T.en.ui[k]), `${k}: ${T.en.ui[k]}`).toBe(true);
});
it("writes every lesson title and About heading in Title Case", async () => {
  const { LESSONS } = await import("../src/tutorial.ts");
  for (const l of LESSONS) expect(titleCase(l.title), l.title).toBe(true);
  const { ABOUT } = await import("../public/about.js");
  for (const [heading] of ABOUT.en.sections) expect(titleCase(heading), heading).toBe(true);
});
it("shows the same Title Case in the page's own markup as in its translations", () => {
  for (const el of page.querySelectorAll("[data-t]")) {
    const key = (el as HTMLElement).dataset.t!;
    if (!["nameTitle", "positionTitle", "ticketTitle", "fame", "bell", "guessLabel", "yourTurn", "netWorth", "level", "thAvg"].includes(key)) continue;
    expect(el.textContent, key).toBe(T.en.ui[key]);
  }
});

// ADR 0046, 0047: Simulation is drawn at random, not a script. Nothing a
// player reads about it says script, 剧本 or 筋書き, and the Chinese tab is
// 模拟. The Tutorial is fixed, and may still say so.
it("describes Simulation as a random simulation, never a script", async () => {
  const { ABOUT } = await import("../public/about.js");
  const words = /script|剧本|脚本|筋書き|台本/i;
  const fixed = new Set(["modeTutorial"]);
  for (const lang of LANGS) {
    const own = Object.entries(T[lang].ui).filter(([k]) => !fixed.has(k)).map(([k, v]) => `${k}: ${v}`);
    for (const line of [...own, ...Object.values(T[lang].tips), ...Object.keys(T[lang].events ?? {}), JSON.stringify(ABOUT[lang]), JSON.stringify((T[lang] as unknown as { scenarios: unknown }).scenarios)]) expect(line, lang).not.toMatch(words);
  }
  expect(T.zh.ui.simulation).toBe("模拟");
  expect(T.en.ui.simulation).toBe("Simulation");
  expect(T.ja.ui.simulation).toBe("シナリオ");
  expect(T.en.ui.lobbySimulationText).toMatch(/random/);
  expect(ABOUT.en.sections.flat(2).join(" ")).toMatch(/at random/);
});

// ADR 0047: the tab is Simulation in English and 模拟 in Chinese, with the mode
// id `simulation`; Japanese keeps シナリオ, which fits the phone tab bar where
// シミュレーション does not. Its old names, Scenario, Live and History, still
// lead to the tabs, in the page and the server.
it("names the mode simulation, and keeps its old names working", () => {
  expect(page.querySelector('[data-mode="simulation"]')).not.toBeNull();
  expect(page.querySelector('[data-mode="scenario"]')).toBeNull();
  expect(page.querySelector("#here-simulation")).not.toBeNull();
  const app = readFileSync("public/app.js", "utf8");
  expect(app).toMatch(/const MODES = \["replay", "simulation", "tutorial"\]/);
  expect(app).toMatch(/renamed = \(m\) => \(\{ history: "replay", live: "simulation", scenario: "simulation" \}\)/);
  const server = readFileSync("src/server.ts", "utf8");
  expect(server).toMatch(/const MODES = \["replay", "simulation"\] as const/);
  expect(server).toMatch(/OLD: Record<string, Mode> = \{ history: "replay", live: "simulation", scenario: "simulation" \}/);
});
it("never calls the tab Scenario to a player", () => {
  for (const lang of LANGS) for (const [k, v] of Object.entries(T[lang].ui)) if (lang !== "ja") expect(`${k}: ${v}`, lang).not.toMatch(/Scenario|scenario:/);
  expect(T.en.tips.tabSimulation).toBeTruthy();
  expect(T.en.tips).not.toHaveProperty("tabScenario");
});

// ADR 0048: the tab bar is wide enough for the longest tab with a player
// count on it, Simulation 12, in every state: 460px, which the header holds
// as a column from 1181px and as a row of its own from 901px down, where side
// by side the tools overlapped it. No tab truncates with an ellipsis.
it("gives the tab bar room for its widest tab, and its own row where the header is narrow", () => {
  const css = readFileSync("public/app.css", "utf8");
  expect(css).toMatch(/\.top \{ display: grid; grid-template-columns: 344px 460px minmax\(0, 1fr\) auto;/);
  const band = css.slice(css.indexOf("@media (max-width: 1180px)"), css.indexOf("@media (max-width: 900px)"));
  expect(band).toMatch(/\.tabs \{ grid-column: 1 \/ -1; grid-row: 2; justify-self: start; width: 460px; max-width: 100%; \}/);
  expect(band).toMatch(/\.tools \{ grid-column: 2; grid-row: 1;/);
  expect(band).toMatch(/\.whoami \{ grid-column: 1 \/ -1; grid-row: 3;/);
  expect(band).not.toMatch(/\.tabs button \{[^}]*font-size/);
});

// ADR 0049: a hover tip is a joke or a short name; a term that needs
// explaining has a small info button (ⓘ) beside it, whose text is the
// definition. The two are never the same words.
it("gives every info button an explanation and a name in every language", () => {
  const buttons = [...page.querySelectorAll("button[data-info]")] as HTMLElement[];
  expect(buttons.length).toBeGreaterThanOrEqual(10);
  for (const b of buttons) {
    expect(b.textContent?.trim(), b.dataset.info).toBe("ⓘ");
    expect(b.getAttribute("type")).toBe("button");
    expect(b.dataset.tAria, b.dataset.info).toBe(`info_${b.dataset.info}`);
    expect(b.closest("button:not([data-info])"), `${b.dataset.info} is inside another button`).toBeNull();
    for (const lang of LANGS) {
      expect(T[lang].info[b.dataset.info!], `${lang}.info.${b.dataset.info}`).toEqual(expect.stringMatching(/\S{3}/));
      expect(T[lang].ui[`info_${b.dataset.info}`], `${lang}.ui.info_${b.dataset.info}`).toEqual(expect.stringMatching(/\S{3}/));
    }
  }
});
it("never reuses an explanation as a hover tip, or leaves one without a counterpart", () => {
  for (const lang of LANGS) {
    const explained = new Set(Object.values(T[lang].info));
    for (const [k, tip] of Object.entries(T[lang].tips)) expect(explained.has(tip), `${lang}.tips.${k} repeats an explanation`).toBe(false);
    for (const k of Object.keys(T[lang].info)) expect(Object.keys(T.en.info), `${lang} has info.${k}`).toContain(k);
  }
  expect(Object.keys(T.ja.info).sort()).toEqual(Object.keys(T.en.info).sort());
  expect(Object.keys(T.zh.info).sort()).toEqual(Object.keys(T.en.info).sort());
});
it("keeps a hover tip short: one line of voice, never a definition", () => {
  const limit = { en: 60, ja: 40, zh: 36 };
  // The three indicator switches show what they are on hover, in place of an
  // info button (ADR 0059), so they may run longer, but not without a limit.
  const indicators = new Set(["ma", "bb", "rsi"]);
  const own = { en: 160, ja: 100, zh: 90 };
  for (const lang of LANGS) for (const [k, tip] of Object.entries(T[lang].tips)) {
    if (k.endsWith("Row") || k === "unrankedRow") continue;
    const cap = indicators.has(k) ? own[lang] : limit[lang];
    expect([...tip].length, `${lang}.tips.${k}: ${tip}`).toBeLessThanOrEqual(cap);
  }
  expect(readFileSync("public/index.html", "utf8"), "the switches have no info button any more").not.toMatch(/studies-info|data-info="indicators"/);
});

// ADR 0051: a tip or a definition breaks only between its clauses, after . , ;
// : ! ? or 。，、；：！？, so each clause must fit one line of a phone's panel.
// Measured in a browser at 360px, 331px of text holds about 53 average English
// letters or 25 Japanese and Chinese characters; these limits are the earlier
// warning, the browser measurement is the proof (see the ADR).
it("keeps every clause of a tip or a definition short enough for one line on a phone", async () => {
  const { clauses } = await import("../public/clauses.js");
  const limit = { en: 58, ja: 24, zh: 24 };
  for (const lang of LANGS) for (const group of ["tips", "info"] as const) for (const [k, text] of Object.entries(T[lang][group])) {
    if (k.endsWith("Row")) continue;
    for (const c of clauses(text)) expect([...c].length, `${lang}.${group}.${k}: ${c}`).toBeLessThanOrEqual(limit[lang]);
  }
});
it("splits a tip only after its own punctuation, and loses no words doing so", async () => {
  const { clauses } = await import("../public/clauses.js");
  for (const lang of LANGS) for (const group of ["tips", "info"] as const) for (const [k, text] of Object.entries(T[lang][group])) {
    const parts = clauses(text) as string[];
    expect(parts.join("").replace(/\s/g, ""), `${lang}.${group}.${k}`).toBe(text.replace(/\s/g, ""));
    for (const p of parts.slice(0, -1)) expect(p, `${lang}.${group}.${k}: ${p}`).toMatch(/[.,;:!?。，、；：！？]$/);
  }
});
it("never breaks inside a clause: each is one unbreakable span", () => {
  const css = readFileSync("public/app.css", "utf8");
  expect(css).toMatch(/\.tip \.clause \{ white-space: nowrap; \}/);
  expect(readFileSync("public/tips.js", "utf8")).toMatch(/className: "clause"/);
});

// ADR 0052: the tutorial lights a control by adding a class to it, and the page
// redraws its figures every tick. A redraw that sets the whole className on a
// lit element wipes the ring out again half a second later, so none may.
it("never overwrites the class of an element the tutorial can light", () => {
  const app = readFileSync("public/app.js", "utf8");
  const targets = app.match(/const TARGETS = \{([^}]*)\}/)![1];
  const ids = [...targets.matchAll(/:\s*"([a-z-]+)"/g)].map((m) => m[1]);
  expect(ids.length).toBeGreaterThanOrEqual(10);
  for (const id of ids) expect(app, `$("${id}").className is assigned, wiping the spotlight`).not.toMatch(new RegExp(`\\$\\("${id}"\\)\\.className\\s*=`));
});
// The ring and the dimming are a shadow and an outline drawn outside the lit
// element, so an element that clips its own overflow must not be one.
it("does not clip the spotlight on an element that hides its overflow", () => {
  const css = readFileSync("public/app.css", "utf8");
  const clip = css.match(/\.acct dd \{[^}]*overflow: hidden/);
  const reset = css.match(/\.acct dd\.focus \{[^}]*overflow: visible/);
  expect(!clip || reset, ".acct dd hides its overflow and so cuts off the spotlight").toBeTruthy();
});

// ADR 0052: the spotlight reads which controls are on screen, so it must run
// after the render has shown or hidden them. Run from the lesson's own part
// of the render, it asked about the Stop Loss before the position panel had
// revealed it, found nothing, and lit nothing in two lessons.
it("lights the tutorial's step after the render has laid out the page", () => {
  const app = readFileSync("public/app.js", "utf8");
  const start = app.indexOf("function render(s) {");
  const render = app.slice(start, app.indexOf("\n// One stream at a time", start));
  const reveal = render.indexOf('$("pos-exits").hidden');
  const lit = render.indexOf("spotlight(");
  expect(reveal, "render shows the position's exits").toBeGreaterThan(0);
  expect(lit, "render lights the step").toBeGreaterThan(0);
  expect(lit, "the step is lit after the exits are shown or hidden").toBeGreaterThan(reveal);
  // and not also from the lesson's own early part, which runs before them
  const lessonFn = app.slice(app.indexOf("function lesson(s) {"), app.indexOf("\n}\n", app.indexOf("function lesson(s) {")));
  expect(lessonFn, "lesson() lights the step too early").not.toMatch(/spotlight\(/);
});

// ADR 0052: the Dad's Savings lesson tells the player to press Borrow, so the
// button must be there in the tutorial, whose rounds are never in the trade
// phase that a market's Borrow waits for.
it("shows Borrow in the tutorial when the player is broke, not only in a trading round", () => {
  const app = readFileSync("public/app.js", "utf8");
  // the rule says when lending is open, and Borrow shows when the player is broke with loans left and it is
  const lending = app.match(/const lending = (.*);/)![1];
  expect(lending, "a tutorial lends while the price stands still").toMatch(/tutorial \? s\.phase === "waiting"/);
  expect(lending, "a market lends while it trades").toMatch(/s\.phase === "trade"/);
  // Borrow is offered, in a pop-up (ADR 0057), to a player who is broke or under a margin call
  const rule = app.match(/const offer = (.*);/)![1];
  expect(rule).toMatch(/y\.broke/);
  expect(rule).toMatch(/y\.called/);
  expect(rule).toMatch(/loansLeft/);
  expect(rule, "nobody Dad has caught is offered it again").toMatch(/!y\.caught/);
  expect(rule, "Borrow must follow the rule above, not a bare trade phase").toMatch(/\blending\b/);
  expect(rule).not.toMatch(/s\.phase === "trade"/);
});

// ADR 0053: the tutorial's pointer is the tutorial's alone, it waits for the
// player, and it does not dim the page. It must be gone the moment another
// mode is on show, since only a tutorial's state has a lesson to clear it.
const pointerApp = readFileSync("public/app.js", "utf8");
const pointerCss = readFileSync("public/app.css", "utf8");
it("tutorial pointer: does not dim the page: no shadow spread around the ring, and no dimming class", () => {
  const focus = pointerCss.match(/\n\.focus \{([^}]*)\}/)![1];
  expect(focus).not.toMatch(/100vmax|100vw|100vh/);
  expect(focus).toMatch(/outline: 3px solid/);
  expect(pointerApp).not.toMatch(/classList\.(add|remove|toggle)\("spotlit"/);
  expect(pointerCss).not.toMatch(/\.spotlit/);
});
it("tutorial pointer: is cleared when another mode is shown, by the state and by the switch", () => {
  const render = pointerApp.slice(pointerApp.indexOf("function render(s) {"), pointerApp.indexOf("\n// One stream at a time"));
  expect(render, "render clears it when a state has no lesson").toMatch(/if \(s\.lesson\) spotlight\([^)]*\);\s*else clearPointer\(\)/);
  const watch = pointerApp.slice(pointerApp.indexOf("function watch(next) {"), pointerApp.indexOf("\nfor (const tab of document.querySelectorAll"));
  expect(watch, "switching tabs clears it at once").toMatch(/clearPointer\(\)/);
});
it("tutorial pointer: waits for the player, with no timer that moves it on by itself", () => {
  expect(pointerApp).not.toMatch(/LOOK_MS|lookTimer|lookNext/);
});
it("tutorial pointer: moves on from a step to look at by a click or Enter, Space or the right arrow, and not from typing", () => {
  expect(pointerApp).toMatch(/function nextLook\(/);
  const keys = pointerApp.match(/addEventListener\("keydown", \(e\) => \{([\s\S]*?)\n\}\);/g)?.find((k) => k.includes("nextLook"));
  expect(keys, "a keydown handler calls nextLook").toBeDefined();
  expect(keys).toMatch(/Enter/);
  expect(keys).toMatch(/ArrowRight/);
  expect(keys).toMatch(/INPUT|isContentEditable|tagName/);
  const down = pointerApp.slice(pointerApp.indexOf('addEventListener("pointerdown", (e) => {'));
  expect(down.slice(0, down.indexOf("\n});")), "a pointerdown listener calls nextLook").toMatch(/nextLook\(\)/);
  // a click must still do its own work: the handler never stops or cancels it
  expect(down.slice(0, down.indexOf("\n});"))).not.toMatch(/preventDefault|stopPropagation|stopImmediatePropagation/);
});

// ADR 0054: the lesson is a compact card in the chart's bottom right and no
// longer a panel across the page; a step that waits ten seconds is done for the
// player, with a countdown on show all that time; a slider step slides.
const lessonHtml = readFileSync("public/index.html", "utf8");
const lessonCss = readFileSync("public/app.css", "utf8");
const lessonApp = readFileSync("public/app.js", "utf8");
it("puts the lesson inside the chart's box, not in a panel across the page", () => {
  const doc = new JSDOM(lessonHtml).window.document;
  const card = doc.getElementById("lesson")!;
  expect(card.closest(".chart-box"), "the lesson is in the chart box").not.toBeNull();
  expect(card.closest("main > .lesson"), "and not a panel above the columns").toBeNull();
  for (const id of ["lesson-n", "lesson-title", "lesson-text", "lesson-task", "restart", "lesson-back", "lesson-skip", "lesson-pause", "lesson-end"]) expect(card.querySelector("#" + id), id).not.toBeNull();
  expect(card.querySelector("#lesson-next"), "no Next button").toBeNull();
  const rule = lessonCss.match(/\n\.lesson \{([^}]*)\}/g)!.join(" ");
  expect(rule).toMatch(/position: absolute/);
  expect(rule).toMatch(/bottom:/);
  // it spans the chart's width but stops short of its right end, where the price runs
  expect(rule).toMatch(/left: \d+px/);
  expect(Number(rule.match(/right: (\d+)%/)?.[1]), "a share of the chart's right end is left clear").toBeGreaterThanOrEqual(14);
  expect(lessonCss, "the full-width fixed heights are gone").not.toMatch(/\.lesson \{ height: (196|220|360|472)px/);
});
it("shows a countdown for nine seconds, and does the step for the player when it ends", () => {
  expect(lessonApp).toMatch(/const AUTO_S = 9;/);
  // the countdown is in the step's own words, beside the lit control, all the time
  expect(lessonApp).toMatch(/t\("autoIn", \{ s: autoLeft \}\)/);
  // the countdown leads the tip, so it shows from its start and is never cut off
  expect(lessonApp).toMatch(/\$\{t\("autoIn", \{ s: autoLeft \}\)\} · \$\{hintFor\.words\}/);
  // and the tip is one line, however long its words
  expect(lessonCss).toMatch(/\.step-hint \{[^}]*white-space: nowrap/);
  expect(lessonApp.slice(lessonApp.indexOf("function showCount"), lessonApp.indexOf("function doForPlayer"))).toMatch(/hintFor\.words/);
  for (const lang of LANGS) {
    expect(T[lang].ui.autoIn, lang).toContain("{s}");
  }
  expect(lessonApp).toMatch(/autoMove\(/);
  // the countdown restarts on a step, a slider move, a click or a key
  const reset = lessonApp.slice(lessonApp.indexOf("function armAuto"));
  expect(reset).toMatch(/clearInterval|clearTimeout/);
  // and it never runs while the page is hidden or a dialog is open
  expect(lessonApp.slice(lessonApp.indexOf("function tickAuto"), lessonApp.indexOf("function tickAuto") + 900)).toMatch(/document\.hidden/);
  expect(lessonApp.slice(lessonApp.indexOf("function tickAuto"), lessonApp.indexOf("function tickAuto") + 900)).toMatch(/dialog\[open\]/);
});
it("slides a slider by itself in steps, and respects reduced motion", () => {
  const slide = lessonApp.slice(lessonApp.indexOf("function slideTo"), lessonApp.indexOf("function slideTo") + 1200);
  expect(slide).toMatch(/requestAnimationFrame|setInterval/);
  expect(slide).toMatch(/prefers-reduced-motion/);
});

// The lit control is lifted above its neighbours, and in the first lesson the
// lit control is the chart the card sits on; so the card must be above it, and
// the pointer's words above the card, or the card is hidden by what it explains.
it("stacks the lesson card above a lit control and below the pointer's words", () => {
  const z = (sel: string) => Number(lessonCss.match(new RegExp(`\\n${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[^}]*z-index: (\\d+)`))?.[1]);
  expect(z(".lesson"), ".lesson").toBeGreaterThan(z(".focus"));
  expect(z(".step-hint"), ".step-hint").toBeGreaterThan(z(".lesson"));
});

// ADR 0059: there is no Why? button. The lesson's text is always on the card,
// on the right, under the head, and the title and task are on the left.
it("always shows the lesson's text, with no Why? button to open it", () => {
  const doc = new JSDOM(lessonHtml).window.document;
  expect(doc.getElementById("lesson-why"), "no Why? button").toBeNull();
  expect(lessonCss, "nothing hides the text").not.toMatch(/#lesson-text \{ display: none/);
  expect(lessonApp).not.toMatch(/lesson-why|classList\.toggle\("open"/);
  for (const lang of LANGS) expect(Object.keys(T[lang].ui), lang).not.toContain("lessonWhy");
  const card = doc.getElementById("lesson")!;
  const left = card.querySelector(".lesson-task")!;
  const right = card.querySelector(".lesson-body")!;
  expect(left.querySelector("#lesson-title")).not.toBeNull();
  expect(left.querySelector("#lesson-task")).not.toBeNull();
  // the head (the number and the buttons) is on the right, above the text
  expect(right.querySelector(".lesson-head")).not.toBeNull();
  expect(right.querySelector("#lesson-text")).not.toBeNull();
  expect(right.querySelector(".lesson-head")!.compareDocumentPosition(right.querySelector("#lesson-text")!) & 4, "the head comes before the text").toBeTruthy();
});

it("counts in bare seconds, can pause the hints, and can end the tutorial (ADR 0055)", () => {
  for (const lang of LANGS) {
    expect(T[lang].ui.autoIn, lang).toMatch(/^\{s\}\S{0,2}$/);
    for (const k of ["hintsPause", "hintsResume", "resetTutorial", "skipLesson", "backLesson"]) {
      expect(T[lang].ui[k], `${lang} ${k}`).toEqual(expect.stringMatching(/\S/));
      expect(T[lang].tips[k], `${lang} tip ${k}`).toEqual(expect.stringMatching(/\S/));
    }
  }
  expect(lessonHtml).toMatch(/id="lesson-pause"[^>]*aria-pressed="false"/);
  expect(lessonHtml).toMatch(/id="lesson-end"/);
  // symbols, not words: no visible text, a label and a tip instead
  const doc = new JSDOM(lessonHtml).window.document;
  for (const id of ["lesson-back", "lesson-skip", "restart", "lesson-pause", "lesson-end"]) {
    expect(doc.getElementById(id)!.textContent, id).toMatch(/^[^A-Za-z]{1,3}$/);
    expect(doc.getElementById(id)!.closest(".lesson-head"), id).not.toBeNull();
  }
  // ⏹ resets the tutorial and stays in it, ↻ starts the lesson again, ⏩ skips it (ADR 0057)
  expect(lessonApp.slice(lessonApp.indexOf('$("lesson-end").onclick'), lessonApp.indexOf('$("lesson-end").onclick') + 120)).toMatch(/act\("restart"\)/);
  expect(lessonApp).not.toMatch(/\$\("lesson-end"\)\.onclick = \(\) => watch/);
  expect(lessonApp).toMatch(/\$\("lesson-skip"\)\.onclick = \(\) => act\("skip"\)/);
  expect(lessonApp).toMatch(/\$\("restart"\)\.onclick = \(\) => \{[^}]*act\("again"\)/);
  // the buttons are in the order ⏩ ⏸ ↻ ⏹, each a symbol
  expect([...doc.querySelectorAll(".lesson-head button")].map((b) => b.id)).toEqual(["lesson-back", "lesson-skip", "lesson-pause", "restart", "lesson-end"]);
  expect(lessonApp).toMatch(/\$\("lesson-back"\)\.onclick = \(\) => \{[^}]*act\("back"\)/);
  // paused: no timer is armed and no countdown text is shown
  expect(lessonApp.slice(lessonApp.indexOf("function armAuto"), lessonApp.indexOf("function tickAuto"))).toMatch(/autoPaused/);
  expect(lessonApp.slice(lessonApp.indexOf("function showCount"), lessonApp.indexOf("function doForPlayer"))).toMatch(/autoPaused/);
});
it("a click on the lesson card does not move a look step on", () => {
  expect(lessonApp).toMatch(/closest\?\.\("#lesson"\) && nextLook\(\)/);
});

// ADR 0057: the lesson card's layout, Dad's savings as a pop-up in every
// mode, an Account panel of its own, every tick scale, and the fee.
describe("the lesson card, the pop-up for Dad's savings, the Account panel and the sliders' scales", () => {
  const doc = new JSDOM(lessonHtml).window.document;
  it("puts the title and task on the left, and the head over the text on the right", () => {
    expect(doc.querySelector(".lesson-task #lesson-task")).not.toBeNull();
    expect(doc.querySelector(".lesson-body .lesson-head #lesson-n")).not.toBeNull();
    expect(lessonCss).toMatch(/\.lesson \{[^}]*grid-template-columns: minmax\(0, 0\.9fr\) minmax\(0, 1\.1fr\)/);
  });
  it("keeps Borrow in a pop-up, not in a panel, and says it in quotation marks", () => {
    const dad = doc.getElementById("dad")!;
    expect(dad.tagName).toBe("DIALOG");
    expect(dad.querySelector("#borrow")).not.toBeNull();
    expect(doc.querySelector(".panel #borrow"), "no Borrow button in a panel").toBeNull();
    for (const lang of LANGS) {
      for (const k of ["borrow", "dadText"]) expect(T[lang].ui[k], `${lang} ${k}`).toMatch(/["“「]/);
      for (const k of ["caughtText", "caughtBig", "caughtSub", "dadTitle", "dadNo"]) expect(T[lang].ui[k], `${lang} ${k}`).toEqual(expect.stringMatching(/\S/));
      expect(T[lang].news.caught, lang).toContain("{who}");
      expect(T[lang].news["you-caught"], lang).toEqual(expect.stringMatching(/\S/));
    }
  });
  it("gives the account its own panel, apart from the ticket", () => {
    const panel = doc.querySelector('.panel[data-fold="account"]')!;
    expect(panel.querySelector("#equity")).not.toBeNull();
    expect(panel.querySelector("#level")).not.toBeNull();
    expect(panel.querySelector("#meter")).not.toBeNull();
    expect(doc.querySelector(".ticket #equity"), "the ticket no longer holds the figures").toBeNull();
    expect(panel.closest(".side-col")).not.toBeNull();
  });
  it("marks every rung of the ladder, lights the chosen one, and no longer names Australia's cap on the track", () => {
    expect(lessonApp).toMatch(/ticks\("lev-ticks", ladder\.map/);
    expect(lessonApp).not.toMatch(/capsTick\b[^\n]*"cap"/);
    expect(lessonApp).toMatch(/classList\.toggle\("on"/);
    expect(lessonCss).toMatch(/\.ticks span\.on/);
  });
  it("says what the financing fee is, from the same rate the desk charges", async () => {
    const { FEE } = await import("../src/fx.ts");
    expect(lessonApp).toMatch(new RegExp(`const FEE = ${String(FEE).replace(/[.+]/g, "\\$&")};`));
    expect(doc.getElementById("fee-note")).not.toBeNull();
    for (const lang of LANGS) {
      expect(T[lang].ui.feeRate, lang).toContain("{pct}");
      expect(T[lang].tips.fee, lang).toEqual(expect.stringMatching(/\S/));
    }
  });
});

// ADR 0059: the sliders' scales and colours, the leverage notes, the indicator
// tips, a plain line on Buy and Sell, and nothing reserved under Pray.
describe("the ticket's words, colours and spacing", () => {
  const doc = new JSDOM(lessonHtml).window.document;
  it("writes a different note for every rung, and still says which one is Australia's cap", async () => {
    const { LEVERAGES } = await import("../src/fx.ts");
    for (const lang of LANGS) {
      const notes = T[lang].ui.notes as Record<number, string>;
      expect(Object.keys(notes).map(Number).sort((a, b) => a - b), lang).toEqual(LEVERAGES);
      const words = LEVERAGES.map((l) => notes[l]);
      expect(new Set(words).size, `${lang}: every rung has its own words`).toBe(LEVERAGES.length);
      // no note is a single stock adjective: each is a phrase, or the cap's name
      for (const l of LEVERAGES) expect([...notes[l]].length, `${lang} ${l}`).toBeGreaterThanOrEqual(4);
    }
    expect(T.en.ui.notes[30]).toMatch(/Australia/);
    expect(T.ja.ui.notes[30]).toMatch(/オーストラリア/);
    expect(T.zh.ui.notes[30]).toMatch(/澳洲|澳大利亚/);
    expect(JSON.stringify(Object.values(T.en.ui.notes)), "the old stock words are gone").not.toMatch(/sensible|careful|steady/);
  });
  it("colours each slider by its heat, calm to alarming, and past the cap the leverage is marked offshore", () => {
    expect(lessonApp).toMatch(/setProperty\("--heat"/);
    expect(lessonApp).toMatch(/classList\.toggle\("offshore", choice\.leverage > CAP\)/);
    expect(lessonApp).toMatch(/const CAP = 30;/);
    expect(lessonCss).toMatch(/\.slide \{ --heat:/);
    expect(lessonCss).toMatch(/accent-color: var\(--heat/);
    expect(lessonCss).toMatch(/\.ticks span\.on \{ color: var\(--heat\)/);
  });
  it("runs the heat from green through amber at the cap to red at the top", () => {
    // the page's own functions, read out of its source and run here
    const src = lessonApp.slice(lessonApp.indexOf("const hue ="), lessonApp.indexOf("const CAP = 30;") + "const CAP = 30;".length);
    const { hue, levHeat } = new Function(`${src}; return { hue, levHeat };`)() as { hue: (h: number) => string; levHeat: (l: number) => number };
    const h = (l: number) => Number(hue(levHeat(l)).match(/hsl\((\d+)/)![1]);
    expect(levHeat(1)).toBe(0);
    expect(levHeat(30)).toBeCloseTo(0.35, 6);
    expect(levHeat(1000)).toBeCloseTo(1, 6);
    expect(h(1)).toBeGreaterThan(h(30));
    expect(h(30)).toBeGreaterThan(h(100));
    expect(h(100)).toBeGreaterThan(h(1000));
    expect(h(1), "calm is green").toBeGreaterThanOrEqual(120);
    expect(h(1000), "alarm is red").toBeLessThanOrEqual(5);
    // each step up past the cap is a visible change
    for (const [a, b] of [[30, 100], [100, 200], [200, 500], [500, 1000]]) expect(h(a) - h(b), `${a} to ${b}`).toBeGreaterThanOrEqual(8);
  });
  it("says on each button what it earns on, for a beginner, in every language", () => {
    for (const id of ["sell", "buy"]) {
      const small = doc.querySelector(`#${id} small`)!;
      expect(small, `${id} has a note`).not.toBeNull();
      expect(small.getAttribute("data-t")).toBe(`${id}Note`);
    }
    for (const lang of LANGS) for (const k of ["sellNote", "buyNote"]) expect(T[lang].ui[k], `${lang} ${k}`).toEqual(expect.stringMatching(/\S/));
    expect(T.en.ui.sellNote).toMatch(/falls?/i);
    expect(T.en.ui.buyNote).toMatch(/rises?/i);
    expect(T.ja.ui.sellNote).toMatch(/値下がり/);
    expect(T.ja.ui.buyNote).toMatch(/値上がり/);
    expect(T.zh.ui.sellNote).toMatch(/下跌/);
    expect(T.zh.ui.buyNote).toMatch(/上涨/);
  });
  it("shows what MA, BB and RSI are on hover, with no info button beside them", () => {
    for (const k of ["ma", "bb", "rsi"]) {
      expect(doc.querySelector(`[data-study="${k}"]`)!.getAttribute("data-tip"), k).toBe(k);
      expect(doc.querySelector(`[data-study="${k}"]`)!.hasAttribute("data-info"), `${k} is a toggle, so a click must not pin an info tip`).toBe(false);
    }
    expect(doc.querySelector(".studies-info")).toBeNull();
    for (const lang of LANGS) for (const k of ["ma", "bb", "rsi"]) expect(Object.keys(T[lang].info), `${lang} info.${k} is unused now`).not.toContain(k);
  });
  it("has no mode line in the chart's head, only a headline over the chart when there is one", () => {
    expect(doc.querySelector(".quote #mode"), "the mode line is not in the quote line").toBeNull();
    expect(doc.querySelector(".chart-box > #mode")).not.toBeNull();
    expect(doc.getElementById("mode")!.hasAttribute("hidden")).toBe(true);
    expect(lessonApp).not.toMatch(/t\(tutorial \? "modeTutorial"/);
    expect(lessonCss).not.toMatch(/\.quote \{[^}]*height: 4\.6rem/);
  });
  it("reserves no empty space under the Pray button for a refusal", () => {
    expect(lessonCss).not.toMatch(/\.error \{[^}]*height: 2\.6em/);
    expect(lessonCss).toMatch(/\.error:empty \{ display: none; \}/);
  });
});
it("puts the lesson card under the chart on a phone, where the chart is too short to share", () => {
  const phone = lessonCss.slice(lessonCss.indexOf("@media (max-width: 560px)"));
  expect(phone).toMatch(/\.lesson \{ position: static;/);
  expect(phone).toMatch(/\.lesson \{[^}]*max-height: none/);
});

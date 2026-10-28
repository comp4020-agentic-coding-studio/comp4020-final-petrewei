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
it("puts pause and end in the quote line, between the price and the clock", () => {
  const quote = page.querySelector(".quote")!;
  const order = [...quote.children].map((e) => e.id || e.className);
  expect(order.indexOf("round-ctl")).toBeGreaterThan(order.indexOf("price"));
  expect(order.indexOf("round-ctl")).toBeLessThan(order.indexOf("clock"));
  expect([...quote.querySelectorAll("#round-ctl button")].map((b) => b.id)).toEqual(["pause", "finish"]);
  expect(page.querySelectorAll("#pause, #finish")).toHaveLength(2);
  expect(page.querySelector(".ticket #pause, .ticket #finish")).toBeNull();
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
// 模拟.
it("describes Simulation as a random simulation, never a script", async () => {
  const { ABOUT } = await import("../public/about.js");
  const words = /script|剧本|脚本|筋書き|台本/i;
  for (const lang of LANGS) {
    const own = Object.entries(T[lang].ui).map(([k, v]) => `${k}: ${v}`);
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

// The tutorial's lesson card (ADRs 0054 to 0059): it sits in the chart's box,
// carries a symbol for each of its five controls, and every word it shows is in
// all three languages. How it behaves is checked in a browser, not by reading
// the page's source.
const lessonHtml = readFileSync("public/index.html", "utf8");
const lessonApp = readFileSync("public/app.js", "utf8");
it("puts the lesson in the chart's box, with five symbol buttons in its head, and its words in every language", () => {
  const doc = new JSDOM(lessonHtml).window.document;
  const card = doc.getElementById("lesson")!;
  expect(card.closest(".chart-box"), "the lesson is in the chart box").not.toBeNull();
  for (const id of ["lesson-n", "lesson-title", "lesson-text", "lesson-task"]) expect(card.querySelector("#" + id), id).not.toBeNull();
  // symbols, not words: no visible letters, with a spoken label and a tip instead
  expect([...card.querySelectorAll(".lesson-head button")].map((b) => b.id)).toEqual(["lesson-back", "lesson-skip", "lesson-pause", "restart", "lesson-end"]);
  for (const b of card.querySelectorAll(".lesson-head button")) expect(b.textContent, b.id).toMatch(/^[^A-Za-z]{1,3}$/);
  for (const lang of LANGS) {
    expect(T[lang].ui.autoIn, lang).toMatch(/^\{s\}\S{0,2}$/);
    for (const k of ["hintsPause", "hintsResume", "resetTutorial", "skipLesson", "backLesson", "restart"]) expect(T[lang].tips[k] ?? T[lang].ui[k], `${lang} ${k}`).toEqual(expect.stringMatching(/\S/));
  }
});

// ADRs 0057 to 0059: Dad's savings in a pop-up, the account in a panel of its own,
// the sliders' notes, colours and fee, and a plain line on Buy and Sell.
describe("the ticket, the account and Dad's pop-up", () => {
  const doc = new JSDOM(lessonHtml).window.document;
  it("keeps Borrow in a pop-up, not in a panel, and says it in quotation marks in every language", () => {
    const dad = doc.getElementById("dad")!;
    expect(dad.tagName).toBe("DIALOG");
    expect(dad.querySelector("#borrow")).not.toBeNull();
    expect(doc.querySelector(".panel #borrow"), "no Borrow button in a panel").toBeNull();
    for (const lang of LANGS) {
      for (const k of ["borrow", "dadText"]) expect(T[lang].ui[k], `${lang} ${k}`).toMatch(/["“「]/);
      for (const k of ["caughtText", "caughtBig", "dadTitle", "dadNo"]) expect(T[lang].ui[k], `${lang} ${k}`).toEqual(expect.stringMatching(/\S/));
      expect(T[lang].news.caught, lang).toContain("{who}");
    }
  });

  it("gives the account a panel of its own, apart from the ticket", () => {
    const panel = doc.querySelector('.panel[data-fold="account"]')!;
    for (const id of ["equity", "level", "meter"]) expect(panel.querySelector("#" + id), id).not.toBeNull();
    expect(doc.querySelector(".ticket #equity"), "the ticket no longer holds the figures").toBeNull();
  });

  it("writes a different note for every rung, naming Australia's cap at 30×, in every language", async () => {
    const { LEVERAGES } = await import("../src/fx.ts");
    for (const lang of LANGS) {
      const notes = T[lang].ui.notes as Record<number, string>;
      expect(Object.keys(notes).map(Number).sort((a, b) => a - b), lang).toEqual(LEVERAGES);
      expect(new Set(LEVERAGES.map((l) => notes[l])).size, `${lang}: every rung has its own words`).toBe(LEVERAGES.length);
    }
    expect(T.en.ui.notes[30]).toMatch(/Australia/);
    expect(T.ja.ui.notes[30]).toMatch(/オーストラリア/);
    expect(T.zh.ui.notes[30]).toMatch(/澳洲|澳大利亚/);
  });

  it("runs the heat from green through amber at the cap to red at the top, in visible steps", async () => {
    const { hue, levHeat } = await import("../public/ticket.js");
    const { CAP, LEVERAGES } = await import("../src/fx.ts");
    const top = LEVERAGES.at(-1)!;
    const h = (l: number) => Number(hue(levHeat(l, CAP, top)).match(/hsl\((\d+)/)![1]);
    expect(levHeat(1, CAP, top)).toBe(0);
    expect(levHeat(CAP, CAP, top)).toBeCloseTo(0.35, 6);
    expect(levHeat(top, CAP, top)).toBeCloseTo(1, 6);
    expect(h(1), "calm is green").toBeGreaterThanOrEqual(120);
    expect(h(top), "alarm is red").toBeLessThanOrEqual(5);
    for (const [a, b] of [[1, 30], [30, 100], [100, 200], [200, 500], [500, 1000]]) expect(h(a) - h(b), `${a} to ${b}`).toBeGreaterThanOrEqual(8);
  });

  it("shows the financing fee a minute at a time, from the desk's own rate", async () => {
    const { feeRate, RULES } = await import("../src/fx.ts");
    const { feePerMinute } = await import("../public/ticket.js");
    // the desk charges per tick, and the page is told how many ticks make a minute
    for (const lev of [1, 30, 100, 500, 1000]) expect(Number.parseFloat(feePerMinute(RULES.fee, lev, 120)), `${lev}×`).toBeCloseTo(feeRate(lev) * 120 * 100, 1);
    for (const lang of LANGS) {
      expect(T[lang].ui.feeRate, lang).toContain("{pct}");
      expect(T[lang].tips.fee, lang).toEqual(expect.stringMatching(/\S/));
    }
  });

  it("says on Buy and Sell what each earns on, for a beginner, in every language", () => {
    for (const id of ["sell", "buy"]) expect(doc.querySelector(`#${id} small`)?.getAttribute("data-t"), id).toBe(`${id}Note`);
    expect(T.en.ui.sellNote).toMatch(/falls?/i);
    expect(T.en.ui.buyNote).toMatch(/rises?/i);
    expect(T.ja.ui.sellNote).toMatch(/値下がり/);
    expect(T.ja.ui.buyNote).toMatch(/値上がり/);
    expect(T.zh.ui.sellNote).toMatch(/下跌/);
    expect(T.zh.ui.buyNote).toMatch(/上涨/);
  });

  it("shows what MA, BB and RSI are on hover, and a click on one only switches it", () => {
    for (const k of ["ma", "bb", "rsi"]) {
      const study = doc.querySelector(`[data-study="${k}"]`)!;
      expect(study.getAttribute("data-tip"), k).toBe(k);
      expect(study.hasAttribute("data-info"), `${k} is a toggle, so a click must not pin an info tip`).toBe(false);
    }
  });
});

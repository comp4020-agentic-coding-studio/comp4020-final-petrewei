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

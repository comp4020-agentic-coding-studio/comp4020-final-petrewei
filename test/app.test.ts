import { marketIn } from "../src/pages.ts";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";
import { state } from "../spec/helpers.ts";
import * as i18n from "../public/i18n.js";
import * as names from "../public/names.js";
import * as avatars from "../public/avatars.js";
import * as indicators from "../public/indicators.js";
import * as view from "../public/view.js";
import * as ticket from "../public/ticket.js";
import * as art from "../public/art.js";
import * as clauses from "../public/clauses.js";
import * as format from "../public/format.js";
import qrcode from "../public/qrcode.js";
import { autoMove, currentStep } from "../public/plan.js";

async function app(lang: "en" | "ja" | "zh" = "en") {
  const dom = new JSDOM(marketIn("en"), { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.document.documentElement.dataset.lang = lang;
  const streams: Stream[] = [];
  class Stream {
    onmessage?: (e: { data: string }) => Promise<void>;
    onerror?: () => void;
    onopen?: () => void;
    listeners = new Map<string, () => void>();
    constructor() { streams.push(this); }
    closed = false;
    close() { this.closed = true; }
    addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback); }
  }
  // Layout and drawing are browser-only; this check observes the actual page
  // event handler and bubble DOM, with the canvas and network replaced.
  const context = new Proxy({ measureText: (t: string) => ({ width: t.length * 5 }) }, { get: (o, k) => o[k as keyof typeof o] ?? (() => {}) });
  vi.spyOn(w.HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(w.Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 100, left: 100, right: 300, bottom: 150, width: 200, height: 50, x: 100, y: 100, toJSON() {} });
  const fetch = vi.fn(async (_url: string, _options?: RequestInit) => ({ ok: true, json: async () => ({ ok: true }) }));
  const intervals: (() => void)[] = [];
  const setInterval = w.setInterval.bind(w);
  vi.spyOn(w, "setInterval").mockImplementation((callback, ms) => {
    if (typeof callback === "function" && ms === 1000) intervals.push(callback as () => void);
    return setInterval(callback, ms);
  });
  Object.assign(w, i18n, names, avatars, indicators, view, ticket, art, clauses, format, {
    autoMove, planStep: currentStep, EventSource: Stream, qrcode,
    fetch,
    CSS: { escape: (s: string) => s },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    retip() {}, useClauses() {}, useInfo() {}, useWords() {},
  });
  // Supply the imports in this window's realm; execute the shipped page,
  // without exporting or reaching into its private state for the check.
  for (const [file, factory] of [["requests", "makeAction, sendAction"], ["dom", "element, button, input"], ["transport", "createTransport"], ["chart", "createChart"], ["tutorial-ui", "createTutorial"], ["account", "createAccountPanel"]]) {
    w.eval(readFileSync(`public/${file}.js`, "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "") + `\nObject.assign(window, { ${factory} });`);
  }
  w.eval(readFileSync("public/app.js", "utf8").replace(/^import .*$/gm, ""));
  const base = await state();
  const emit = async (extra = {}) => streams.at(-1)!.onmessage!({ data: JSON.stringify({ ...base, phase: "trade", you: { ...base.you, named: true }, ...extra }) });
  return { dom, w, base, emit, streams, fetch, intervals };
}

it("blocks orders after a stream failure until a fresh snapshot arrives, including after an open event", async () => {
  const { dom, w, emit, streams, fetch } = await app();
  try {
    await emit();
    const buy = w.document.getElementById("buy") as HTMLButtonElement;
    expect(buy.disabled).toBe(false);
    streams.at(-1)!.onerror?.();
    expect(w.document.getElementById("connection")?.textContent).toBe(i18n.T.en.ui.connectionReconnecting);
    expect(buy.disabled).toBe(true);
    buy.click();
    expect(fetch).not.toHaveBeenCalled();
    streams.at(-1)!.onopen?.();
    expect(buy.disabled).toBe(true);
    await emit();
    expect(buy.disabled).toBe(false);
    expect(w.document.getElementById("connection")?.textContent).toBe(i18n.T.en.ui.connectionRestored);
  } finally {
    dom.window.close();
  }
});

it("ignores a late message from an old stream after leaving and returning to the same market", async () => {
  const { dom, w, base, emit, streams } = await app();
  try {
    await emit();
    const old = streams[0];
    (w.document.querySelector('[data-mode="random"]') as HTMLElement).click();
    (w.document.querySelector('[data-mode="rewind"]') as HTMLElement).click();
    await old.onmessage!({ data: JSON.stringify({ ...base, you: { ...base.you, named: true }, pair: "OLD/STREAM" }) });
    expect(w.document.getElementById("pair")?.textContent).not.toBe("OLD/STREAM");
    expect((w.document.getElementById("buy") as HTMLButtonElement).disabled).toBe(true);
    await emit();
    expect((w.document.getElementById("buy") as HTMLButtonElement).disabled).toBe(false);
  } finally {
    dom.window.close();
  }
});

it("keeps buffered state from re-enabling orders while the browser is offline", async () => {
  const { dom, w, emit } = await app();
  try {
    await emit();
    const online = vi.spyOn(w.navigator, "onLine", "get").mockReturnValue(false);
    w.dispatchEvent(new w.Event("offline"));
    await emit();
    expect(w.document.getElementById("connection")!.textContent).toBe(i18n.T.en.ui.connectionOffline);
    expect((w.document.getElementById("buy") as HTMLButtonElement).disabled).toBe(true);
    online.mockReturnValue(true);
    w.dispatchEvent(new w.Event("online"));
    await emit();
    expect((w.document.getElementById("buy") as HTMLButtonElement).disabled).toBe(false);
  } finally {
    dom.window.close();
  }
});

it("recovers a missing price update with a full snapshot and then accepts contiguous updates", async () => {
  const { dom, w, base, emit, fetch } = await app();
  try {
    await emit();
    const recoveredPrice = base.prices.at(-1)! * 1.01;
    const recovered = [...base.prices, recoveredPrice];
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, ...base, from: 0, prices: recovered, you: { ...base.you, named: true } }) });
    await emit({ from: base.prices.length + 5, prices: [recoveredPrice * 2] });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/state?mode=rewind");
    expect(w.document.getElementById("price")!.textContent).toBe(format.quoted(recoveredPrice));
    const nextPrice = recoveredPrice * 1.001;
    await emit({ from: recovered.length, prices: [nextPrice] });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(w.document.getElementById("price")!.textContent).toBe(format.quoted(nextPrice));
  } finally {
    dom.window.close();
  }
});

it("explains a lost action reply without sending the action again", async () => {
  const { dom, w, emit, fetch } = await app();
  try {
    await emit();
    fetch.mockRejectedValueOnce(new TypeError("network lost"));
    (w.document.getElementById("buy") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(w.document.getElementById("error")!.textContent).toBe(i18n.T.en.ui.requestUncertain));
    await emit();
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    dom.window.close();
  }
});

it("drops a refusal that arrives after the page has moved to another market", async () => {
  const { dom, w, emit, fetch } = await app();
  try {
    await emit();
    let answer!: (reply: { ok: boolean; json: () => Promise<unknown> }) => void;
    fetch.mockReturnValueOnce(new Promise((resolve) => (answer = resolve as typeof answer)));
    (w.document.getElementById("buy") as HTMLButtonElement).click();
    (w.document.querySelector('[data-mode="random"]') as HTMLElement).click();
    answer({ ok: false, json: async () => ({ error: "A round is already running." }) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(w.document.getElementById("error")!.textContent).toBe("");
  } finally {
    dom.window.close();
  }
});

it("keeps an idle heartbeat connection alive and replaces a silent one after three missed beats", async () => {
  const { dom, w, emit, streams, intervals } = await app();
  try {
    await emit();
    let now = Date.now();
    vi.spyOn(w.Date, "now").mockImplementation(() => now);
    const check = intervals[0];
    for (let i = 0; i < 4; i++) {
      now += 5000;
      streams[0].listeners.get("heartbeat")!();
      check();
    }
    expect(streams).toHaveLength(1);
    now += 15_001;
    check();
    expect(streams).toHaveLength(2);
    expect((w.document.getElementById("buy") as HTMLButtonElement).disabled).toBe(true);
    expect(w.document.getElementById("connection")!.textContent).toBe(i18n.T.en.ui.connectionReconnecting);
    await emit();
    expect((w.document.getElementById("buy") as HTMLButtonElement).disabled).toBe(false);
  } finally {
    dom.window.close();
  }
});

it("shows new speech bubbles after switching between markets with independent event counters", async () => {
  const { dom, w, base, emit: send } = await app();
  try {
    const pop = (n: number) => ({ n, who: base.you.code, kind: "wild", lev: 200 });
    const emit = (mode: string, n: number) => send({ mode, pops: [pop(n)] });
    await emit("rewind", 100);
    (w.document.querySelector('[data-mode="random"]') as HTMLElement).click();
    await emit("random", 20);
    expect(w.document.querySelectorAll(".bubble")).toHaveLength(0);
    await emit("random", 21);
    expect(w.document.querySelectorAll(".bubble")).toHaveLength(1);
    w.document.querySelectorAll(".bubble").forEach((e) => e.remove());
    (w.document.querySelector('[data-mode="rewind"]') as HTMLElement).click();
    await emit("rewind", 101);
    expect(w.document.querySelectorAll(".bubble")).toHaveLength(0);
    await emit("rewind", 102);
    expect(w.document.querySelectorAll(".bubble")).toHaveLength(1);
  } finally {
    dom.window.close();
  }
});

it("moves leverage one offered rung per native slider step and stops at each end", async () => {
  const { dom, w, base, emit } = await app();
  try {
    await emit();
    const slider = w.document.getElementById("leverage") as HTMLInputElement;
    const output = () => w.document.getElementById("lev-out")!.textContent;
    const input = () => slider.dispatchEvent(new w.Event("input", { bubbles: true }));
    const step = (direction: "stepUp" | "stepDown") => {
      slider[direction]();
      input();
    };
    // stepUp/stepDown are the native steps an arrow key takes in a browser.
    const cap = base.leverages.indexOf(base.desk.cap);
    step("stepUp");
    expect(output()).toBe(`${base.leverages[cap + 1]}×`);
    step("stepDown");
    expect(output()).toBe(`${base.desk.cap}×`);
    slider.value = slider.min;
    input();
    step("stepDown");
    expect(output()).toBe(`${base.leverages[0]}×`);
    for (const lev of base.leverages.slice(1)) {
      step("stepUp");
      expect(output()).toBe(`${lev}×`);
    }
    step("stepUp");
    expect(output()).toBe(`${base.leverages.at(-1)}×`);
  } finally {
    dom.window.close();
  }
});

it.each(["en", "ja", "zh"] as const)("names every trading slider in %s", async (lang) => {
  const { dom, w, emit } = await app(lang);
  try {
    await emit();
    for (const [id, key] of [["leverage", "leverage"], ["margin", "margin"], ["sl-dist", "slFull"], ["tp-dist", "tpFull"], ["psl-dist", "slFull"], ["ptp-dist", "tpFull"]]) {
      expect(w.document.getElementById(id)!.getAttribute("aria-label"), id).toBe(i18n.T[lang].ui[key]);
    }
  } finally {
    dom.window.close();
  }
});

it("keeps ticket exits independent of the open position's exits and preserves a held thumb during updates", async () => {
  const { dom, w, base, emit, fetch } = await app();
  try {
    const element = (id: string) => w.document.getElementById(id)!;
    const slider = (id: string) => element(id) as HTMLInputElement;
    const price = base.prices.at(-1)!;
    const you = { ...base.you, named: true, pos: { side: 1, entry: price, leverage: 10, margin: 1000, stop: price * 0.98, take: null, call: price * 0.95, cut: price * 0.92 } };
    await emit({ you });
    expect(element("psl-on").getAttribute("aria-checked")).toBe("true");
    expect(element("ptp-on").getAttribute("aria-checked")).toBe("false");
    expect(element("psl-pct").textContent).toBe("2%");
    element("sl-on").click();
    expect(element("sl-on").getAttribute("aria-checked")).toBe("true");
    expect(element("sl-pct").textContent).toBe("5%");
    slider("psl-dist").value = "0";
    slider("psl-dist").dispatchEvent(new w.Event("input", { bubbles: true }));
    await emit({ you });
    expect(slider("psl-dist").value).toBe("0");
    expect(element("psl-pct").textContent).toBe("50%");
    expect(element("psl-fill").style.width).toBe("48%");
    expect(element("sl-pct").textContent).toBe("5%");
    slider("psl-dist").dispatchEvent(new w.Event("change", { bubbles: true }));
    const request = JSON.parse(fetch.mock.calls.at(-1)![1]!.body as string);
    expect(request).toMatchObject({ kind: "stop", pct: 50 });
    await emit({ you });
    expect(element("psl-pct").textContent).toBe("2%");
  } finally {
    dom.window.close();
  }
});

// The feed is news and actions only: upcoming releases and their forecasts are not listed over it.
it("lists no upcoming releases over the feed", async () => {
  const { dom, w, emit } = await app();
  try {
    await emit({ calendar: [{ cur: "USD", kind: "cpi", d: 1, h: 4, outcome: null }] });
    expect((w.document.getElementById("calendar") as HTMLElement).hidden).toBe(true);
    expect(w.document.querySelectorAll("#calendar li")).toHaveLength(0);
  } finally {
    dom.window.close();
  }
});

it("keeps Live account returns and risk marks fixed when the chart changes pairs", async () => {
  const { dom, w, base, emit } = await app();
  try {
    (w.document.querySelector('[data-mode="live"]') as HTMLElement).click();
    const positions = [
      { pair: "AUD/USD", side: 1, margin: 2000, leverage: 10, entry: 1, now: 1.01, pnl: 200, live: true },
      { pair: "EUR/USD", side: 1, margin: 6000, leverage: 10, entry: 1, now: 1.01, pnl: 600, live: true },
    ];
    const you = { ...base.you, named: true, used: 8000, pnl: 800, debt: 0, equity: 10800, level: 135, positions };
    for (const pair of ["AUD/USD", "EUR/USD", "GBP/USD"]) {
      await emit({ mode: "live", chart: { studies: true, days: "date", slotMs: 900_000 }, clock: { key: "clockLive", at: Date.now() }, live: true, pair, pairs: positions.map((p) => p.pair).concat("GBP/USD"), calendar: [], board: [], you: { ...you, pos: positions.find((p) => p.pair === pair) ?? null } });
      expect(w.document.getElementById("pnl-pct")!.textContent, pair).toBe("+10.00%");
      for (const [id, share] of [["mark-call", 0.5], ["mark-cut", 0.2]] as const) {
        const mark = w.document.getElementById(id)!;
        expect(mark.hidden, `${pair} ${id}`).toBe(false);
        expect(parseFloat(mark.style.left)).toBeCloseTo(ticket.gauge(share * you.used / base.start) * 100, 6);
      }
    }
    await emit({ mode: "live", chart: { studies: true, days: "date", slotMs: 900_000 }, clock: { key: "clockLive", at: Date.now() }, live: true, calendar: [], board: [], you: { ...you, used: 0, pnl: 0, pos: null, positions: [] } });
    expect(w.document.getElementById("pnl-pct")!.textContent).toBe("");
    expect(w.document.getElementById("mark-call")!.hidden).toBe(true);
    expect(w.document.getElementById("mark-cut")!.hidden).toBe(true);
  } finally {
    dom.window.close();
  }
});

it("restores a cached page with live controllers and a fresh stream", async () => {
  const { dom, w, emit, streams } = await app();
  try {
    await emit();
    const old = streams.at(-1)!;
    w.dispatchEvent(new w.PageTransitionEvent("pagehide", { persisted: true }));
    expect(old.closed).toBe(true);
    expect(w.document.getElementById("lesson-play")!.onclick).not.toBeNull();
    expect(w.document.getElementById("step-hint")).not.toBeNull();
    w.dispatchEvent(new w.PageTransitionEvent("pageshow", { persisted: true }));
    expect(streams.length).toBe(2);
    await emit();
    expect((w.document.getElementById("buy") as HTMLButtonElement).disabled).toBe(false);
    (w.document.querySelector('[data-mode="random"]') as HTMLElement).click();
    expect(streams.length).toBe(3);
  } finally { dom.window.close(); }
});

// Settings sets where a new order starts, a margin and a rung of leverage, and can ask before closing: Close sends
// nothing until confirmed, and nothing at all when the player says no.
it("starts a new order where Settings says, and asks before closing when told to", async () => {
  const { dom, w, base, emit, fetch, streams } = await app();
  try {
    streams.at(-1)!.onopen?.();
    await emit();
    const pick = (id: string, v: string) => {
      const el = w.document.getElementById(id) as HTMLSelectElement;
      el.value = v;
      el.dispatchEvent(new w.Event("change"));
    };
    pick("set-margin", "0.5");
    pick("set-leverage", "10");
    expect(w.document.getElementById("margin-out")!.textContent).toBe("50%");
    expect(w.document.getElementById("lev-out")!.textContent).toBe("10×");
    // kept for the next visit
    expect(JSON.parse(w.localStorage.getItem("prefs")!)).toMatchObject({ margin: 0.5, leverage: 10 });
    // Close is a button only with a position open
    const price = base.prices.at(-1)!;
    await emit({ you: { ...base.you, named: true, pos: { side: 1, entry: price, leverage: 10, margin: 1000, stop: null, take: null, call: price * 0.95, cut: price * 0.92 } } });
    // with the setting off, Close asks nothing; on, it asks before anything is sent, and a "no" sends nothing
    let asked = 0;
    w.confirm = () => (asked++, false);
    (w.document.getElementById("close") as HTMLButtonElement).click();
    expect(asked, "off: no question").toBe(0);
    (w.document.getElementById("set-confirm") as HTMLButtonElement).click();
    expect(JSON.parse(w.localStorage.getItem("prefs")!).confirm).toBe(true);
    const sentBefore = fetch.mock.calls.length;
    (w.document.getElementById("close") as HTMLButtonElement).click();
    expect(asked, "on: asks first").toBe(1);
    expect(fetch.mock.calls.length, "a refused confirm sends nothing").toBe(sentBefore);
  } finally {
    dom.window.close();
  }
});

// The time zone in Settings moves every time the page shows, on a 24-hour clock, and is kept for the next visit.
it("shows Live's clock in the zone chosen in Settings, on a 24-hour clock", async () => {
  const { dom, w, base, emit } = await app();
  try {
    (w.document.querySelector('[data-mode="live"]') as HTMLElement).click();
    const you = { ...base.you, named: true, pos: null, positions: [], used: 0, pnl: 0, debt: 0, out: false, lending: false };
    const at = Date.parse("2026-11-09T13:05:00Z");
    const live = { mode: "live", chart: { studies: true, days: "date", slotMs: 900_000 }, clock: { key: "clockLive", at }, live: true, pair: "AUD/USD", pairs: ["AUD/USD"], calendar: [], board: [], you, headline: null };
    const zone = w.document.getElementById("set-zone") as HTMLSelectElement;
    zone.value = "Asia/Tokyo";
    zone.dispatchEvent(new w.Event("change"));
    await emit(live);
    const label = w.document.getElementById("clock")!.getAttribute("aria-label")!;
    expect(label).toContain("22:05");
    expect(label).not.toMatch(/am|pm/i);
    expect(JSON.parse(w.localStorage.getItem("prefs")!).zone).toBe("Asia/Tokyo");
    zone.value = "Europe/London";
    zone.dispatchEvent(new w.Event("change"));
    await emit(live);
    expect(w.document.getElementById("clock")!.getAttribute("aria-label")).toContain("13:05");
  } finally {
    dom.window.close();
  }
});

// Every zone the browser knows is offered, by region, the common few first, so a player anywhere finds their own.
it("offers every time zone the browser knows in Settings, grouped by region", async () => {
  const { dom, w } = await app();
  try {
    const zone = w.document.getElementById("set-zone") as HTMLSelectElement;
    const offered = new Set([...zone.options].map((o) => o.value));
    for (const z of Intl.supportedValuesOf("timeZone")) expect(offered, z).toContain(z);
    expect(offered).toContain("");
    expect(zone.querySelectorAll("optgroup").length).toBeGreaterThan(5);
    expect(zone.querySelector('option[value="Asia/Tokyo"]')!.textContent).toMatch(/Tokyo.*GMT\+9/);
  } finally {
    dom.window.close();
  }
});

// The chart's widest range says what it spans, never a vague "All": Live's six days of slots read as a week.
it("names the chart's widest range by its span: a week on Live", async () => {
  const { dom, w, base, emit } = await app();
  try {
    (w.document.querySelector('[data-mode="live"]') as HTMLElement).click();
    const you = { ...base.you, named: true, pos: null, positions: [], used: 0, pnl: 0, debt: 0, out: false, lending: false };
    const prices = Array.from({ length: 96 * 6 + 1 }, (_, i) => 0.65 + i / 1e5);
    await emit({ mode: "live", chart: { studies: true, days: "date", slotMs: 900_000 }, clock: { key: "clockLive", at: Date.now() }, live: true, pair: "AUD/USD", pairs: ["AUD/USD"], calendar: [], board: [], you, headline: null, prices, history: [], steps: 8, dayTicks: 96, tick: 2_000_000, total: prices.length - 1 });
    await new Promise((r) => w.requestAnimationFrame(() => r(null)));
    const first = (w.document.getElementById("range") as HTMLSelectElement).options[0];
    expect(first.textContent).toBe("1W");
    expect(first.textContent).not.toMatch(/all/i);
  } finally {
    dom.window.close();
  }
});

// A room joins from a phone by a QR code of this tab's own address (docs/product.md, candidate 1): the button opens
// it, the code is drawn, and the address is written out under it for anyone who cannot scan.
it("shows a QR code of this tab's address, to join from a phone", async () => {
  const { dom, w, emit } = await app();
  try {
    await emit();
    (w.document.querySelector('[data-mode="live"]') as HTMLElement).click();
    // jsdom has no modal dialogs; a browser's opens the dialog as this does
    w.HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    w.document.getElementById("join-btn")!.click();
    expect((w.document.getElementById("join-box") as HTMLDialogElement).open).toBe(true);
    expect(w.document.querySelector("#join-qr svg, #join-qr img"), "the code is drawn").not.toBeNull();
    expect(w.document.getElementById("join-url")!.textContent).toBe(w.location.href.split("#")[0]);
  } finally {
    dom.window.close();
  }
});

// An AI agent on Live's board wears the room's bot badge, so people know who they trade beside (ADR 0096); a person
// does not, whatever name they chose.
it("marks an AI agent on Live's board with the bot badge, and nobody else", async () => {
  const { dom, w, base, emit } = await app();
  try {
    (w.document.querySelector('[data-mode="live"]') as HTMLElement).click();
    const you = { ...base.you, named: true, pos: null, positions: [], used: 0, pnl: 0, debt: 0, out: false, lending: false };
    const row = (name: string, agent: boolean) => ({ name, draw: null, face: "p0", opened: 0, ended: 1, peak: 10_000, how: "running", worth: 10_000, days: "1d", you: false, agent });
    await emit({ mode: "live", chart: { studies: true, days: "date", slotMs: 900_000 }, clock: { key: "clockLive", at: Date.now() }, live: true, pair: "AUD/USD", pairs: ["AUD/USD"], calendar: [], you, headline: null, board: [row("Agent 79f0fd", true), row("Agent Smith", false)] });
    const rows = [...w.document.querySelectorAll("#board li")];
    expect(rows[0].querySelector(".badge")?.textContent, "the agent").toBe("🤖");
    expect(rows[1].querySelector(".badge"), "a person who chose an agent's name").toBeNull();
  } finally {
    dom.window.close();
  }
});

// Live's news is all in the feed: one piece pinned at the top, the most important of recent news (a central bank's
// decision above a market story), and the rest in the timeline with players' trades, newest first; each real headline
// links to its source, and the pinned one is not listed twice.
it("pins the most important news and keeps the rest in the timeline with trades", async () => {
  const { dom, w, base, emit } = await app();
  try {
    (w.document.querySelector('[data-mode="live"]') as HTMLElement).click();
    const you = { ...base.you, named: true, pos: null, positions: [], used: 0, pnl: 0, debt: 0, out: false, lending: false };
    const at = Date.now() - 600_000;
    const feed = [
      { text: "Kurumi bought AUD/JPY", kind: "buy", key: "m-bought", args: { who: "abc123", name: "Kurumi", draw: -1, pair: "AUD/JPY", lev: 30, pnl: 0 } },
      { text: "CNBC: Stocks edge higher", kind: "news", key: "market", args: { source: "CNBC", title: "Stocks edge higher", link: "https://www.cnbc.com/s", at, score: 1 } },
      { text: "Reserve Bank of Australia: Monetary policy decision", kind: "news", key: "bank", args: { cur: "AUD", source: "Reserve Bank of Australia", title: "Monetary policy decision", link: "https://www.rba.gov.au/m", at, score: 20 } },
    ];
    await emit({ mode: "live", chart: { studies: true, days: "date", slotMs: 900_000 }, clock: { key: "clockLive", at: Date.now() }, live: true, pair: "AUD/USD", pairs: ["AUD/USD"], calendar: [], board: [], you, feed, headline: null });
    const items = [...w.document.querySelectorAll("#feed > li")];
    expect(items[0].classList.contains("pinned"), "one item pinned at the top").toBe(true);
    expect(items[0].textContent).toContain("Monetary policy decision");
    expect(w.document.querySelectorAll("#feed > li.pinned").length).toBe(1);
    // the bank decision is pinned once, not listed again; the market story and the trade stay in the timeline
    expect(items.filter((li) => li.textContent!.includes("Monetary policy decision")).length).toBe(1);
    expect(items.some((li) => li.textContent!.includes("Stocks edge higher"))).toBe(true);
    expect(items.some((li) => li.textContent!.includes("AUD/JPY"))).toBe(true);
    // a real headline links to its source, in a new tab
    const link = w.document.querySelector('#feed a[href="https://www.cnbc.com/s"]') as HTMLAnchorElement;
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    // with no news from the last six hours, a quiet weekend still pins its most important story
    const old = Date.now() - 30 * 3_600_000;
    await emit({ mode: "live", chart: { studies: true, days: "date", slotMs: 900_000 }, clock: { key: "clockLive", at: Date.now() }, live: true, pair: "AUD/USD", pairs: ["AUD/USD"], calendar: [], board: [], you, headline: null, feed: [
      { text: "CNBC: Stocks edge higher", kind: "news", key: "market", args: { source: "CNBC", title: "Stocks edge higher", link: "https://www.cnbc.com/s", at: old, score: 1 } },
      { text: "CNBC: Fed signals higher rates", kind: "news", key: "market", args: { source: "CNBC", title: "Fed signals higher rates", link: "https://www.cnbc.com/f", at: old, score: 8 } },
    ] });
    expect(w.document.querySelector("#feed > li.pinned")?.textContent, "the weekend's most important").toContain("Fed signals higher rates");
    // the chart carries no headline of its own in Live
    expect((w.document.getElementById("mode") as HTMLElement).hidden).toBe(true);
  } finally {
    dom.window.close();
  }
});

// Live shut for the weekend says when the FX week opens, in Sydney time; shut by a mid-week outage, with no opening
// sent, it says only that it is shut, so the page never promises a time that is not coming.
it("tells a Live player when the weekend's shut market opens", async () => {
  const { dom, w, base, emit } = await app();
  try {
    (w.document.querySelector('[data-mode="live"]') as HTMLElement).click();
    const you = { ...base.you, named: true, pos: null, positions: [], used: 0, pnl: 0, debt: 0, out: false, lending: false };
    const shut = { mode: "live", chart: { studies: true, days: "date", slotMs: 900_000 }, clock: { key: "clockLive", at: Date.now() }, live: false, historyGap: false, pair: "AUD/USD", pairs: ["AUD/USD"], calendar: [], board: [], you };
    const opens = Date.parse("2026-11-08T22:00:00Z");
    await emit({ ...shut, opens });
    const line = w.document.getElementById("position")!.textContent!;
    expect(line).toContain(i18n.T.en.ui.liveOpens.replace("{at}", format.localTime(opens, "en")).replace("{zone}", format.zoneName(opens, "en")));
    await emit({ ...shut, opens: null });
    expect(w.document.getElementById("position")!.textContent!).toContain(i18n.T.en.ui.liveShut);
  } finally {
    dom.window.close();
  }
});

// A Live player with nothing open on the chart's pair is told why, and what they owe, as in every other tab: the line
// had been rewritten for Live after the debt was added to it, so a Live borrower never saw the debt.
it("tells a Live player with nothing open what they owe", async () => {
  const { dom, w, base, emit } = await app();
  try {
    (w.document.querySelector('[data-mode="live"]') as HTMLElement).click();
    const you = { ...base.you, named: true, pos: null, positions: [], used: 0, pnl: 0, debt: 1500, out: false, lending: true };
    await emit({ mode: "live", chart: { studies: true, days: "date", slotMs: 900_000 }, clock: { key: "clockLive", at: Date.now() }, live: true, pair: "AUD/USD", pairs: ["AUD/USD"], calendar: [], board: [], you });
    const line = w.document.getElementById("position")!.textContent!;
    expect(line).toContain(i18n.T.en.ui.noPos);
    expect(line).toContain(format.aud(1500));
  } finally {
    dom.window.close();
  }
});

it("keeps a newer stream snapshot and its deltas when an older recovery reply arrives", async () => {
  const { dom, w, base, emit, fetch } = await app();
  try {
    await emit();
    let answer!: (response: { ok: boolean; json: () => Promise<{ ok: boolean }> }) => void;
    fetch.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const pending = emit({ from: base.prices.length + 5, prices: [1.5] });
    const round = base.round + 1;
    await emit({ round, from: 0, prices: [1.25] });
    await emit({ round, from: 1, prices: [1.3] });
    answer({ ok: true, json: async () => ({ ok: true, ...base, from: 0, prices: [1.1] }) });
    await pending;
    expect(w.document.getElementById("price")!.textContent).toBe(format.quoted(1.3));
  } finally {
    dom.window.close();
  }
});

it("uses the time an alert rang and keeps its price in the alert text", async () => {
  const { dom, w, emit } = await app();
  try {
    const when = Date.parse("2026-11-10T09:30:00Z");
    await emit({ feed: [{ kind: "info", key: "alert-rang", args: { pair: "AUD/USD", at: 0.65 }, when }] });
    const line = w.document.querySelector("#feed > li")!;
    expect(line.querySelector("time")?.dateTime).toBe(new Date(when).toISOString());
    expect(line.textContent).toContain("AUD/USD reached 0.65.");
  } finally {
    dom.window.close();
  }
});

it("leaves the pending ticket blank until Live has a price and blocks submission while offline", async () => {
  const { dom, w, base, emit } = await app();
  try {
    (w.document.querySelector('[data-mode="live"]') as HTMLElement).click();
    const you = { ...base.you, named: true, positions: [], alerts: [] };
    const live = { mode: "live", pair: "AUD/USD", pairs: ["AUD/USD"], you, board: [], chart: { studies: true, days: "date", slotMs: 900_000 } };
    const pending = w.document.querySelector<HTMLDetailsElement>("#pend")!;
    const level = w.document.querySelector<HTMLInputElement>("#pend-at")!;
    const place = w.document.querySelector<HTMLButtonElement>("#pend-place")!;
    await emit({ ...live, phase: "waiting", live: false, prices: [] });
    pending.open = true;
    pending.dispatchEvent(new w.Event("toggle"));
    expect(level.value).toBe("");
    expect(place.disabled).toBe(true);
    await emit({ ...live, live: true, prices: [0.7] });
    vi.spyOn(w.navigator, "onLine", "get").mockReturnValue(false);
    w.dispatchEvent(new w.Event("offline"));
    level.value = "0.65";
    level.dispatchEvent(new w.Event("input"));
    expect(place.disabled).toBe(true);
  } finally {
    dom.window.close();
  }
});

it("ignores a superseded recovery failure even when several deltas were waiting on it", async () => {
  const { dom, w, base, emit, fetch, streams } = await app();
  try {
    await emit();
    streams.at(-1)!.onerror?.();
    let fail!: (reason: Error) => void;
    fetch.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const delta = { from: base.prices.length + 5, prices: [1.5] };
    const waiting = [emit(delta), emit(delta)];
    await emit({ from: 0, prices: [1.25] });
    fail(new Error("Snapshot request failed"));
    await Promise.all(waiting);
    expect(w.document.getElementById("connection")?.textContent).toBe(i18n.T.en.ui.connectionRestored);
    expect(w.document.querySelector<HTMLButtonElement>("#buy")!.disabled).toBe(false);
  } finally {
    dom.window.close();
  }
});

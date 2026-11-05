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
    close() {}
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
    autoMove, planStep: currentStep, EventSource: Stream,
    fetch,
    CSS: { escape: (s: string) => s },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    retip() {}, useClauses() {}, useInfo() {}, useWords() {},
  });
  // Supply the imports in this window's realm; execute the shipped page,
  // without exporting or reaching into its private state for the check.
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
    (w.document.querySelector('[data-mode="simulation"]') as HTMLElement).click();
    (w.document.querySelector('[data-mode="replay"]') as HTMLElement).click();
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
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/state?mode=replay");
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
    (w.document.querySelector('[data-mode="simulation"]') as HTMLElement).click();
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
    await emit("replay", 100);
    (w.document.querySelector('[data-mode="simulation"]') as HTMLElement).click();
    await emit("simulation", 20);
    expect(w.document.querySelectorAll(".bubble")).toHaveLength(0);
    await emit("simulation", 21);
    expect(w.document.querySelectorAll(".bubble")).toHaveLength(1);
    w.document.querySelectorAll(".bubble").forEach((e) => e.remove());
    (w.document.querySelector('[data-mode="replay"]') as HTMLElement).click();
    await emit("replay", 101);
    expect(w.document.querySelectorAll(".bubble")).toHaveLength(0);
    await emit("replay", 102);
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
    for (const [id, key] of [["leverage", "leverage"], ["stake", "stake"], ["sl-dist", "slFull"], ["tp-dist", "tpFull"], ["psl-dist", "slFull"], ["ptp-dist", "tpFull"]]) {
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

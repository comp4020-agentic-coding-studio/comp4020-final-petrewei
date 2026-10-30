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
import { autoMove, currentStep } from "../public/plan.js";

async function app(lang: "en" | "ja" | "zh" = "en") {
  const dom = new JSDOM(readFileSync("public/index.html", "utf8"), { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.document.documentElement.dataset.lang = lang;
  const streams: { onmessage?: (e: { data: string }) => Promise<void> }[] = [];
  class Stream {
    onmessage?: (e: { data: string }) => Promise<void>;
    constructor() { streams.push(this); }
    close() {}
  }
  // Layout and drawing are browser-only; this check observes the actual page
  // event handler and bubble DOM, with the canvas and network replaced.
  const context = new Proxy({ measureText: (t: string) => ({ width: t.length * 5 }) }, { get: (o, k) => o[k as keyof typeof o] ?? (() => {}) });
  vi.spyOn(w.HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(w.Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 100, left: 100, right: 300, bottom: 150, width: 200, height: 50, x: 100, y: 100, toJSON() {} });
  Object.assign(w, i18n, names, avatars, indicators, view, ticket, art, clauses, {
    autoMove, planStep: currentStep, EventSource: Stream,
    CSS: { escape: (s: string) => s },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    retip() {}, useClauses() {}, useInfo() {}, useWords() {},
  });
  // Supply the imports in this window's realm; execute the shipped page,
  // without exporting or reaching into its private state for the check.
  w.eval(readFileSync("public/app.js", "utf8").replace(/^import .*$/gm, ""));
  const base = await state();
  const emit = async (extra = {}) => streams.at(-1)!.onmessage!({ data: JSON.stringify({ ...base, phase: "trade", you: { ...base.you, named: true }, ...extra }) });
  return { dom, w, base, emit };
}

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

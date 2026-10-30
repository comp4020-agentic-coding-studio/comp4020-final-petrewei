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

it("shows new speech bubbles after switching between markets with independent event counters", async () => {
  const dom = new JSDOM(readFileSync("public/index.html", "utf8"), { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
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
  try {
    // Supply the imports in this window's realm; execute the shipped page,
    // without exporting or reaching into its private state for the check.
    w.eval(readFileSync("public/app.js", "utf8").replace(/^import .*$/gm, ""));
    const base = await state();
    const pop = (n: number) => ({ n, who: base.you.code, kind: "wild", lev: 200 });
    const emit = async (mode: string, n: number) => streams.at(-1)!.onmessage!({ data: JSON.stringify({ ...base, mode, phase: "trade", you: { ...base.you, named: true }, pops: [pop(n)] }) });
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

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it } from "vitest";

// ADR 0049: a term that needs explaining carries a small info button (ⓘ)
// beside its label. Hovering or focusing it shows the explanation, as a tip
// does; a click or tap pins it open, and a second click, Escape or a tap
// elsewhere closes it, so a phone can read it too.
let dom: JSDOM;
let tipsModule: { useInfo: (f: (k: string) => string) => void; useClauses: (f: (t: string) => string[]) => void; useWords: (f: (k: string) => string) => void };
beforeEach(async () => {
  dom = new JSDOM(`<!doctype html><body>
    <p><span id="label">Leverage</span><button id="i" class="info" type="button" data-info="leverage" aria-label="About Leverage">ⓘ</button></p>
    <button id="plain" data-tip="close">Close</button><button id="other">Other</button></body>`, { pretendToBeVisual: true, url: "http://localhost/" });
  const g = globalThis as Record<string, unknown>;
  for (const k of ["window", "document", "addEventListener", "removeEventListener", "innerWidth", "innerHeight", "scrollX", "scrollY"]) g[k] = (dom.window as unknown as Record<string, unknown>)[k];
  g.window = dom.window;
  g.document = dom.window.document;
  g.addEventListener = dom.window.addEventListener.bind(dom.window);
  g.removeEventListener = dom.window.removeEventListener.bind(dom.window);
  (dom.window.HTMLElement.prototype as unknown as { showPopover: () => void }).showPopover = () => {};
  (dom.window.HTMLElement.prototype as unknown as { hidePopover: () => void }).hidePopover = () => {};
  const tips = await import(/* @vite-ignore */ `${pathToFileURL(resolve("public/tips.js")).href}?${Math.random()}`);
  tipsModule = tips;
  tips.useWords((k: string) => ({ leverage: "How many times your money you control.", close: "Close it." })[k] ?? "");
  tips.useClauses((await import("../public/clauses.js")).clauses);
  tips.useInfo((k: string) => ({ leverage: "Leverage multiplies wins and losses alike." })[k] ?? "");
});
afterEach(() => dom.window.close());

const panel = () => dom.window.document.getElementById("tip") as HTMLElement;
const click = (id: string) => dom.window.document.getElementById(id)!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

it("shows the explanation when an info button is clicked, and hides it on a second click", () => {
  click("i");
  expect(panel().hidden).toBe(false);
  expect(panel().textContent).toBe("Leverage multiplies wins and losses alike.");
  expect(dom.window.document.getElementById("i")!.getAttribute("aria-expanded")).toBe("true");
  click("i");
  expect(panel().hidden).toBe(true);
  expect(dom.window.document.getElementById("i")!.getAttribute("aria-expanded")).toBe("false");
});

it("closes the explanation on Escape and on a click elsewhere", () => {
  click("i");
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
  expect(panel().hidden).toBe(true);
  click("i");
  click("other");
  expect(panel().hidden).toBe(true);
});

it("shows the explanation on keyboard focus, as a tip does", () => {
  const i = dom.window.document.getElementById("i") as HTMLElement;
  i.focus();
  i.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
  expect(panel().hidden).toBe(false);
  expect(panel().textContent).toBe("Leverage multiplies wins and losses alike.");
});

it("leaves a plain tip alone, with its own words", () => {
  dom.window.document.getElementById("plain")!.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
  expect(panel().hidden).toBe(true);
  expect(dom.window.document.getElementById("plain")!.getAttribute("aria-describedby")).toBeNull();
});

// ADR 0051: a tip is written as clauses, and may break only between them,
// after . , ; : ! ? or their Japanese and Chinese forms, never inside one.
it("splits a tip into clauses after its punctuation, keeping the mark with its clause", async () => {
  const { clauses } = await import("../public/clauses.js");
  expect(clauses("Bigger numbers, bigger feelings.")).toEqual(["Bigger numbers,", "bigger feelings."]);
  expect(clauses("The broker's cut. Every. Single. Time.")).toEqual(["The broker's cut.", "Every.", "Single.", "Time."]);
  expect(clauses("Stop Loss: closes the trade; switch it on.")).toEqual(["Stop Loss:", "closes the trade;", "switch it on."]);
  expect(clauses("数字が大きいほど、感情も大きい。")).toEqual(["数字が大きいほど、", "感情も大きい。"]);
  expect(clauses("没有标点")).toEqual(["没有标点"]);
  expect(clauses("")).toEqual([]);
});
it("does not split a number, a decimal or an abbreviation's dot", async () => {
  const { clauses } = await import("../public/clauses.js");
  expect(clauses("Costs ¥1,000,000 at 1.5% a day, roughly.")).toEqual(["Costs ¥1,000,000 at 1.5% a day,", "roughly."]);
  expect(clauses("A 30× move, i.e. 3.3%.")).toEqual(["A 30× move,", "i.e. 3.3%."]);
});

// ADR 0051: clauses are joined by a space in English, and by nothing after a
// Japanese or Chinese mark, which is never spaced.
it("joins English clauses with a space and Japanese ones with none", () => {
  const i = dom.window.document.getElementById("i")!;
  tipsModule.useInfo((k: string) => ({ en: "Bigger numbers, bigger feelings.", ja: "数字が大きいほど、感情も大きい。" })[k] ?? "");
  i.setAttribute("data-info", "en");
  click("i");
  expect(panel().textContent).toBe("Bigger numbers, bigger feelings.");
  expect([...panel().querySelectorAll(".clause")].map((c) => c.textContent)).toEqual(["Bigger numbers,", "bigger feelings."]);
  click("i");
  i.setAttribute("data-info", "ja");
  click("i");
  expect(panel().textContent).toBe("数字が大きいほど、感情も大きい。");
  expect([...panel().querySelectorAll(".clause")].map((c) => c.textContent)).toEqual(["数字が大きいほど、", "感情も大きい。"]);
});

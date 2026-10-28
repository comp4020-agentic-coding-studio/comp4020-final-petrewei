import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it } from "vitest";

// ADR 0049: a term that needs explaining carries a small info button (ⓘ)
// beside its label. Hovering or focusing it shows the explanation, as a tip
// does; a click or tap pins it open, and a second click, Escape or a tap
// elsewhere closes it, so a phone can read it too.
let dom: JSDOM;
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
  tips.useWords((k: string) => ({ leverage: "How many times your money you control.", close: "Close it." })[k] ?? "");
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

import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { T } from "../public/i18n.js";
import { LESSONS } from "../src/tutorial.ts";

type Lang = "en" | "ja" | "zh";
const baseURL = "http://localhost:8187";
const lessonTitle = (lang: Lang, id: string): string => T[lang].lessons[id]?.title ?? LESSONS.find((l) => l.id === id)!.title;
async function join(page: Page, lang: Lang, tutorial = false) {
  const name = `Player${randomUUID().slice(0, 8)}`;
  await page.goto(`${baseURL}${lang === "en" ? "/" : `/${lang}/`}`);
  await expect(page.locator("#name-box")).toBeVisible();
  await page.locator("#name-input").fill(name);
  await page.locator(tutorial ? "#name-learn" : "#name-free").click();
  await expect(page.locator("#name-box")).not.toBeVisible();
  return name;
}

test("a newcomer learns to buy with the keyboard and can reach Close on a phone", async ({ page }, info) => {
  const lang = info.project.metadata.lang as Lang;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await join(page, lang, true);
  const hint = page.locator("#step-hint");
  const play = page.locator("#lesson-play");
  const lessonCard = page.locator("#lesson");
  await expect(page.locator("#lesson-title")).toHaveText(lessonTitle(lang, "welcome"));
  // Opened, the tutorial waits stopped: nothing counts down, and only Play and the shape of the card say so.
  await expect(lessonCard).toHaveAttribute("data-transport", "stopped");
  await expect(hint).not.toBeVisible();
  await expect(page.locator("#lesson-task")).toHaveText(T[lang].ui.pressPlay);
  await expect(page.locator("#lesson-back")).toBeDisabled();
  await expect(page.locator("#lesson-skip")).toBeDisabled();
  await expect(page.locator("#lesson-stop")).toBeDisabled();
  await expect(play).toBeEnabled();
  await expect(page.locator(".transport button")).toHaveCount(4);
  // Play starts it, and the same key is now Pause, drawn differently
  await play.click();
  await expect(lessonCard).toHaveAttribute("data-transport", "playing");
  await expect(hint).toContainText(/9s|9秒/);
  await expect(play).toHaveAttribute("aria-label", T[lang].ui.tutorialPause);
  await expect(page.locator("#lesson-play .i-pause")).toBeVisible();
  await expect(page.locator("#lesson-play .i-play")).not.toBeVisible();
  const before = await hint.boundingBox();
  // Pause holds it, with the seconds still shown and the hint not moving
  await play.click();
  await expect(lessonCard).toHaveAttribute("data-transport", "paused");
  await expect(hint).toContainText(/\d+s|\d+秒/);
  expect((await hint.boundingBox())!.width).toBe(before!.width);
  await expect(page.locator("#lesson-task")).toHaveText(T[lang].ui.pausedTask);
  await expect(play).toHaveAttribute("aria-label", T[lang].ui.tutorialContinue);
  // the count does not move while paused
  const held = await hint.textContent();
  await page.waitForTimeout(2500);
  expect(await hint.textContent(), "the countdown is held while paused").toBe(held);
  // the keyboard: Space plays on, Escape stops and waits, from the page and not only from a button
  await page.locator("#chart").click({ position: { x: 5, y: 5 }, force: true });
  await page.keyboard.press("Space");
  await expect(lessonCard).toHaveAttribute("data-transport", "playing");
  await page.keyboard.press("Escape");
  await expect(lessonCard).toHaveAttribute("data-transport", "stopped");
  await expect(hint).not.toBeVisible();
  await expect(page.locator("#lesson-task")).toHaveText(T[lang].ui.pressPlay);
  await page.keyboard.press("Space");
  await expect(lessonCard).toHaveAttribute("data-transport", "playing");
  await page.locator("#lesson-skip").click();
  await expect(page.locator("#lesson-title")).toHaveText(lessonTitle(lang, "buy"));
  const leverage = page.getByRole("slider", { name: T[lang].ui.leverage, exact: true });
  await leverage.press("Home");
  await leverage.press("ArrowRight");
  await expect(page.locator("#lev-out")).toHaveText("3×");
  await leverage.press("ArrowLeft");
  await expect(page.locator("#lev-out")).toHaveText("1×");
  await page.locator("#buy").click();
  await expect(page.locator("#pos-row")).toBeVisible();
  await expect(page.locator("#lesson-title")).toHaveText(lessonTitle(lang, "take-profit"));
  const phone = info.project.name.endsWith("phone");
  if (phone) {
    await page.locator("footer").scrollIntoViewIfNeeded();
    const bar = page.locator("#position-bar");
    await expect(bar).toBeVisible();
    const bounds = await bar.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await expect(page.locator("#mobile-close")).toBeEnabled();
  } else {
    await expect(page.locator("#position-bar")).not.toBeVisible();
  }
  await page.locator(phone ? "#mobile-close" : "#close").click();
  await expect(page.locator("#pos-row")).not.toBeVisible();
  await expect(page.locator("#position-bar")).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  await page.goto(baseURL + (lang === "en" ? "" : "/" + lang) + "/about");
  await expect(page.locator("header.top")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  const themeBefore = await page.locator("html").getAttribute("data-theme");
  await page.locator("#theme").click();
  expect(await page.locator("html").getAttribute("data-theme")).not.toBe(themeBefore);
  expect(errors).toEqual([]);
});

test("two independent players see orders, recover from offline and receive their own round results", async ({ page, browser }, info) => {
  const lang = info.project.metadata.lang as Lang;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const name = await join(page, lang);
  const other = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    const observer = await other.newPage();
    observer.on("pageerror", (error) => errors.push(error.message));
    await join(observer, lang);
    // Round selection lives beside the quote and is shared by both people.
    const state = async () => (await (await page.request.get(`${baseURL}/api/state`)).json());
    const replayPair = page.locator(".quote #replay-pair");
    await expect(replayPair).toBeVisible();
    const initial = await state();
    expect(initial.replayPlots).toHaveLength(13);
    await expect(replayPair.locator("option")).toHaveCount(13);
    for (const plot of initial.replayPlots) {
      await page.waitForTimeout(300);
      await replayPair.selectOption(String(plot.n));
      await expect.poll(async () => (await state()).replayPlot).toBe(plot.n);
      await expect(observer.locator("#replay-pair")).toHaveValue(String(plot.n));
    }
    const raw = (await state()).prices.at(-1);
    await expect(page.locator("#price")).toHaveText(raw.toPrecision(5));
    expect((await replayPair.boundingBox())!.width).toBeLessThan(100);
    const clock = page.locator("#clock");
    expect((await clock.boundingBox())!.width).toBeLessThan(90);
    await page.locator('[data-mode="simulation"]').click();
    await observer.locator('[data-mode="simulation"]').click();
    const base = page.locator(".quote #pair-base");
    const quote = page.locator(".quote #pair-quote");
    await expect(base).toBeVisible();
    expect((await base.boundingBox())!.width).toBeLessThan(65);
    await expect(quote).toBeVisible();
    for (const [currency, select] of [["GBP", base], ["CHF", quote]] as const) {
      await page.waitForTimeout(300);
      await select.selectOption(currency);
      await expect.poll(async () => (await (await page.request.get(`${baseURL}/api/state?mode=simulation`)).json()).pair).toContain(currency);
    }
    await expect(observer.locator("#pair-base")).toHaveValue("GBP");
    await expect(observer.locator("#pair-quote")).toHaveValue("CHF");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
    await page.locator('[data-mode="replay"]').click();
    await observer.locator('[data-mode="replay"]').click();
    await page.locator("#start").click();
    await expect(page.locator("#buy")).toBeEnabled();
    await expect(replayPair).toBeDisabled();
    await expect(page.locator("#lobby")).toHaveClass(/counting/);
    const popup = await page.locator("#lobby").boundingBox();
    const chart = await page.locator("#chart").boundingBox();
    expect(Math.abs(popup!.y + popup!.height / 2 - chart!.y - chart!.height / 2)).toBeLessThan(3);
    await expect(clock).toHaveAttribute("aria-label", /.+/);
    await page.locator("#leverage").press("Home");
    await page.locator("#buy").click();
    const row = observer.locator("#traders li").filter({ hasText: name });
    await expect(row).toContainText("▲ 1×", { timeout: 1000 });

    const chartTop = (await page.locator("#chart").boundingBox())!.y;
    await page.context().setOffline(true);
    const notice = page.locator("#connection");
    await expect(notice).toHaveText(T[lang].ui.connectionOffline);
    await expect(notice).toBeVisible();
    expect((await page.locator("#chart").boundingBox())!.y).toBe(chartTop);
    await expect(page.locator("#buy")).toBeDisabled();
    await expect(page.locator("#close")).toBeDisabled();
    await expect(page.locator("#mobile-close")).toBeDisabled();
    await expect(notice).toBeHidden({ timeout: 1500 });
    await expect(page.locator("#buy")).toBeDisabled();
    expect((await page.locator("#chart").boundingBox())!.y).toBe(chartTop);
    await page.context().setOffline(false);
    await expect(notice).toHaveText(T[lang].ui.connectionRestored);
    await expect(notice).toBeVisible();
    await expect(page.locator("#close")).toBeEnabled();
    await expect(notice).toBeHidden({ timeout: 1500 });
    await expect(row).toContainText("▲ 1×");
    // A returning connection kept the same account and the one order.
    const account = (await (await page.request.get(`${baseURL}/api/state`)).json()).you;
    expect(account.pos.leverage).toBe(1);
    expect(account.pos.margin).toBe(1_000_000);
    await expect(page.locator("#finish")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#finish").click();
    await expect(page.locator("#debrief")).toBeVisible();
    await expect(page.locator("#debrief")).not.toHaveAttribute("open");
    await page.locator("#debrief summary").click();
    await expect(page.locator("#debrief-lines")).toBeVisible();
    await expect(page.locator("#debrief-lines")).toContainText(T[lang].ui.financingPaid);
    await expect(observer.locator("#bell")).toBeVisible();
    await expect(observer.locator("#debrief")).not.toBeVisible();
    const bell = (await (await page.request.get(`${baseURL}/api/state`)).json()).result;
    const mine = bell.ranking.find((r: { you: boolean }) => r.you);
    expect(bell.debrief.net).toBe(mine.balance);
    expect(bell.debrief.score).toBe(mine.score);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
    await page.locator("#dismiss").click();
    await expect(page.locator("#start")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await page.context().setOffline(false);
    await other.close();
  }
});

// The header has to hold at every zoom: 100% on a 1920 screen is 1920 css px, 125% is 1536, 150% is 1280
// and Edge's window at 150% is about 1263. Brand, tabs, who you are and the tools sit on one row, in that
// order, from 1010px up, the tabs in the exact middle of the header and who you are on the right, against
// the tools; only below that do the tabs drop to a row of their own. The tabs never lose their room, nothing
// runs over anything else, and a name too long for its place is cut with an ellipsis, in full on hover.
test("keeps the header on one row in order until it cannot fit, with the longest name", async ({ page }, info) => {
  const lang = info.project.metadata.lang as Lang;
  if (info.project.name.endsWith("phone")) test.skip(true, "the phone has its own layout");
  const kana = "あいうえおかきくけこさしすせそたちつてと";
  const longest = lang === "en" ? "W".repeat(16) + randomUUID().slice(0, 2) : lang === "ja" ? Array.from({ length: 9 }, () => kana[Math.floor(Math.random() * kana.length)]).join("") : "龙".repeat(7) + randomUUID().slice(0, 2);
  await page.setViewportSize({ width: 1536, height: 800 });
  await page.goto(`${baseURL}${lang === "en" ? "/" : `/${lang}/`}`);
  await page.locator("#name-input").fill(longest);
  await page.locator("#name-free").click();
  await expect(page.locator("#name-box")).not.toBeVisible();
  for (const width of [960, 1009, 1010, 1100, 1263, 1280, 1536, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    const m = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const meets = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const brand = box(".brand"), tabs = box(".tabs"), who = box("#whoami"), tools = box(".tools");
      return {
        oneRow: tabs.top < brand.bottom,
        inOrder: brand.right <= tabs.left + 0.5 && tabs.right <= who.left + 0.5 && who.right <= tools.left + 0.5,
        // the middle of the tabs is the middle of the window, and who you are ends where the tools begin
        centred: Math.abs((tabs.left + tabs.right) / 2 - innerWidth / 2) <= 1,
        whoAgainstTools: tools.left - who.right <= 20,
        overlap: [[brand, tabs], [tabs, who], [who, tools], [brand, tools]].some(([a, b]) => meets(a, b)),
        tabsCut: [...document.querySelectorAll(".tabs button")].some((b) => b.scrollWidth > b.clientWidth),
        logoCut: (document.querySelector(".logo") as HTMLElement).getBoundingClientRect().right > brand.right + 1,
        sideways: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(m.overlap, `${width}: something runs over something else`).toBe(false);
    expect(m.tabsCut, `${width}: a tab is cut short`).toBe(false);
    expect(m.logoCut, `${width}: the logo is cut`).toBe(false);
    expect(m.sideways, `${width}: the page scrolls sideways`).toBe(false);
    if (width >= 1010) {
      expect(m.oneRow, `${width}: the tabs went to a row of their own with room for one row`).toBe(true);
      expect(m.inOrder, `${width}: the order is not brand, tabs, who you are, tools`).toBe(true);
      expect(m.centred, `${width}: the tabs are not in the middle of the header`).toBe(true);
      expect(m.whoAgainstTools, `${width}: who you are is not on the right, beside the tools`).toBe(true);
    } else expect(m.oneRow, `${width}: too narrow for one row, so the tabs go below`).toBe(false);
  }
});

// ADR 0040, 0043: on a phone who you are shares the first row with the logo and the tools, the tabs have the
// second, and the subtitle goes on a narrow phone so the name always shows.
test("keeps who you are on the first row of a phone, with the tabs below", async ({ page }, info) => {
  if (!info.project.name.endsWith("phone")) test.skip(true, "the desktop has its own header");
  const lang = info.project.metadata.lang as Lang;
  await join(page, lang);
  const m = await page.evaluate(() => {
    const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const brand = box(".brand"), who = box("#whoami"), tools = box(".tools"), tabs = box(".tabs");
    const sub = document.querySelector(".sub") as HTMLElement;
    return { sameRow: who.top < brand.bottom && tools.top < brand.bottom, tabsBelow: tabs.top >= Math.max(brand.bottom, who.bottom, tools.bottom) - 1, whoBeforeTools: who.right <= tools.left + 0.5, subShown: getComputedStyle(sub).display !== "none", wide: innerWidth, sideways: document.documentElement.scrollWidth > innerWidth };
  });
  expect(m.sameRow, "who you are and the tools share the logo's row").toBe(true);
  expect(m.whoBeforeTools, "who you are is beside the tools, not over them").toBe(true);
  expect(m.tabsBelow, "the tabs have the second row").toBe(true);
  expect(m.sideways, "the page scrolls sideways").toBe(false);
  if (m.wide <= 419) expect(m.subShown, "the subtitle goes on a narrow phone").toBe(false);
});

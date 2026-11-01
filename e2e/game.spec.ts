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
  await expect(page.locator("#lesson-title")).toHaveText(lessonTitle(lang, "welcome"));
  await page.locator("#lesson-skip").click();
  await expect(page.locator("#lesson-title")).toHaveText(lessonTitle(lang, "buy"));
  const leverage = page.getByRole("slider", { name: T[lang].ui.leverage, exact: true });
  await leverage.press("Home");
  await leverage.press("ArrowRight");
  await expect(page.locator("#lev-out")).toHaveText("2×");
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
    for (const pair of ["EUR/CHF", "USD/CNY"]) {
      await page.waitForTimeout(300);
      await replayPair.selectOption(pair);
      await expect.poll(async () => (await state()).pair).toBe(pair);
      await expect(observer.locator("#replay-pair")).toHaveValue(pair);
    }
    const clock = page.locator("#clock");
    expect((await clock.boundingBox())!.width).toBeLessThan(90);
    await page.locator('[data-mode="simulation"]').click();
    await observer.locator('[data-mode="simulation"]').click();
    const base = page.locator(".quote #pair-base");
    const quote = page.locator(".quote #pair-quote");
    await expect(base).toBeVisible();
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

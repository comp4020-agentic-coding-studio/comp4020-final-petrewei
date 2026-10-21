import { expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { baseUrl } from "./helpers.ts";

// The address names the language, never the market: / is English, /ja/
// Japanese, /zh/ Chinese, and each page is served in its language from
// the first byte. People in any language play in the same rooms, so the
// market is not in the address at all. Read-only, so these run live too.
const get = async (path: string) => {
  const res = await fetch(new URL(path, baseUrl), { redirect: "manual" });
  return { res, doc: res.status === 200 ? new JSDOM(await res.text()).window.document : null };
};

it("serves the market in each language at its own address", async () => {
  for (const [path, lang, logo] of [["/", "en", "Losscut!"], ["/ja/", "ja", "ロスカット！"], ["/zh/", "zh-CN", "强制平仓！"]]) {
    const { res, doc } = await get(path);
    expect(res.status, path).toBe(200);
    expect(doc!.documentElement.lang, path).toBe(lang);
    expect(doc!.querySelector(".logo")?.textContent, path).toBe(logo);
  }
});

it("titles each language's page with its logo and subtitle", async () => {
  for (const [path, title] of [["/", "Losscut! Kurumi's FX Fantasy"], ["/ja/", "ロスカット！ くるみのFXファンタジー"], ["/zh/", "强制平仓！久留美的FX白日梦"]]) {
    const { doc } = await get(path);
    expect(doc!.title, path).toBe(title);
  }
});

it("sends /ja and /zh to their trailing-slash address", async () => {
  for (const path of ["/ja", "/zh"]) {
    const { res } = await get(path);
    expect(res.status, path).toBe(301);
    expect(res.headers.get("location")).toBe(`${path}/`);
  }
});

it("has no subtitle after the logo but the language's own", async () => {
  for (const path of ["/", "/ja/", "/zh/"]) {
    const { doc } = await get(path);
    expect(doc!.querySelector(".sub")?.textContent, path).not.toContain("ロスカット");
  }
});

it("serves a player's About page in each language, and keeps the course README", async () => {
  for (const [path, lang] of [["/about", "en"], ["/ja/about", "ja"], ["/zh/about", "zh-CN"]]) {
    const { res, doc } = await get(path);
    expect(res.status, path).toBe(200);
    expect(doc!.documentElement.lang, path).toBe(lang);
    expect(doc!.querySelectorAll("h2").length, path).toBeGreaterThanOrEqual(4);
    expect(doc!.body.textContent, path).toContain("1800 858 858");
  }
  expect((await get("/readme/")).res.status).toBe(200);
});

it("links each page to the same page in the other languages", async () => {
  const { doc } = await get("/ja/about");
  const hrefs = [...doc!.querySelectorAll('link[rel="alternate"]')].map((l) => `${l.getAttribute("hreflang")} ${l.getAttribute("href")}`);
  expect(hrefs).toEqual(expect.arrayContaining(["en /about", "ja /ja/about", "zh-CN /zh/about"]));
});

// The lobby veils the chart until a round starts; the indicator switches
// must sit above it, or nobody can use them before pressing Start.
it("keeps the indicator switches above the lobby", async () => {
  const css = await (await fetch(new URL("/app.css", baseUrl))).text();
  const z = (sel: string) => Number(css.match(new RegExp(`\\n${sel.replace(".", "\\.")} \\{[^}]*z-index: (\\d+)`))?.[1] ?? 0);
  expect(z(".studies")).toBeGreaterThan(z(".lobby"));
  const { doc } = await get("/");
  expect(doc!.querySelectorAll("#studies button")).toHaveLength(3);
});

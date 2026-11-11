import { readFileSync } from "node:fs";
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
  for (const [path, title] of [["/", "Losscut! Kurumi's FX Fantasy"], ["/ja/", "ロスカット！ くるみちゃんの FXファンタジー"], ["/zh/", "强制平仓！久留美的FX白日梦"]]) {
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

// ADR 0099: the bare address follows the language chosen in Settings (the lang cookie), else the browser's, else English;
// /ja/ and /zh/ always show their own, whatever is sent. Each is the page that language's address serves, byte for byte.
const asked = async (path: string, headers: Record<string, string>) => {
  const res = await fetch(new URL(path, baseUrl), { redirect: "manual", headers });
  const html = await res.text();
  return { res, html, lang: new JSDOM(html).window.document.documentElement.lang };
};

it("shows the bare address in the browser's language, and English when it has none of ours", async () => {
  expect((await asked("/", {})).lang, "nothing sent").toBe("en");
  expect((await asked("/", { "accept-language": "ja-JP,ja;q=0.9,en;q=0.5" })).lang).toBe("ja");
  expect((await asked("/", { "accept-language": "zh-TW,zh;q=0.8" })).lang).toBe("zh-CN");
  expect((await asked("/", { "accept-language": "fr-FR,fr;q=0.9" })).lang, "a language we lack").toBe("en");
  const ja = await asked("/", { "accept-language": "ja" });
  expect(ja.html, "the same page /ja/ serves, not a lookalike").toBe((await asked("/ja/", {})).html);
});

it("lets a chosen language beat the browser's, on the bare address only", async () => {
  expect((await asked("/", { cookie: "lang=zh", "accept-language": "ja" })).lang, "the choice wins").toBe("zh-CN");
  expect((await asked("/", { cookie: "lang=en", "accept-language": "ja" })).lang, "English chosen against a Japanese browser").toBe("en");
  expect((await asked("/ja/", { cookie: "lang=zh", "accept-language": "en" })).lang, "/ja/ is Japanese whatever is sent").toBe("ja");
  expect((await asked("/zh/", { cookie: "lang=ja", "accept-language": "ja" })).lang).toBe("zh-CN");
});

it("tells a cache that the bare address depends on what the browser sends, and reads junk as nothing", async () => {
  const bare = await asked("/", {});
  expect(bare.res.headers.get("vary") ?? "", "a shared cache must not hand one language to another").toMatch(/accept-language/i);
  expect(bare.res.headers.get("vary") ?? "").toMatch(/cookie/i);
  const odd: Record<string, string>[] = [{ cookie: "lang=<script>", "accept-language": "ja" }, { cookie: "lang=" + "x".repeat(4000) }, { "accept-language": "x".repeat(8000) }, { cookie: "lang=ja ;lang=zh" }];
  for (const headers of odd) {
    const r = await asked("/", headers);
    expect(r.res.status, JSON.stringify(headers).slice(0, 40)).toBe(200);
    expect(["en", "ja", "zh-CN"]).toContain(r.lang);
  }
  expect((await asked("/", { cookie: "lang=<script>", "accept-language": "ja" })).lang, "a cookie that is not a code is ignored").toBe("ja");
});

it("serves a player's About page in each language, and keeps the course README", async () => {
  for (const [path, lang] of [["/about", "en"], ["/ja/about", "ja"], ["/zh/about", "zh-CN"]]) {
    const { res, doc } = await get(path);
    expect(res.status, path).toBe(200);
    expect(doc!.documentElement.lang, path).toBe(lang);
    expect(doc!.querySelectorAll("h2").length, path).toBeGreaterThanOrEqual(4);
    expect(doc!.body.textContent, path).toContain("1800 858 858");
  }
  // the course README is a public page too, so it says what every public page says: an unofficial fan parody
  const readme = await get("/readme/");
  expect(readme.res.status).toBe(200);
  expect(readme.doc!.querySelector("footer")?.textContent ?? "", "/readme/ footer").toContain("unofficial fan parody");
});

// The About page carries the market's header tools and its footer, and none of what only the
// market can do: its header is cut out of the market page, so a change there must not lose a
// tool or let the tabs and the name button in.
it("gives every About page the header tools and footer, but no tabs or name button", async () => {
  for (const path of ["/about", "/ja/about", "/zh/about"]) {
    const { doc } = await get(path);
    for (const id of ["theme", "music", "bgm"]) expect(doc!.getElementById(id), `${path} #${id}`).not.toBeNull();
    // the language is chosen in Settings, not in the header (ADR 0099); About lists the other languages as links instead
    expect(doc!.getElementById("lang"), `${path} has no language menu`).toBeNull();
    expect(doc!.querySelectorAll(".about-langs a").length, `${path} links the other two languages`).toBe(2);
    expect(doc!.querySelector("header.top"), path).not.toBeNull();
    expect(doc!.querySelector("footer")?.textContent?.trim().length, `${path} footer`).toBeGreaterThan(10);
    expect(doc!.querySelector("[role=tab]"), `${path} has no market tabs`).toBeNull();
    expect(doc!.getElementById("whoami"), `${path} has no name button`).toBeNull();
    expect(doc!.querySelector('script[src="/about-controls.js"]'), `${path} loads its controls`).not.toBeNull();
  }
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

// A module the page imports but the server doesn't serve leaves a blank
// market, and every other check passes: so each import must answer.
it("serves every module a page script imports", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const imports = new Set<string>();
  for (const f of readdirSync("public").filter((n) => n.endsWith(".js"))) {
    for (const m of readFileSync(`public/${f}`, "utf8").matchAll(/^import [^;]* from "(\/[^"]+)";/gm)) imports.add(m[1]);
  }
  expect(imports.size).toBeGreaterThanOrEqual(5);
  for (const path of imports) {
    const res = await fetch(new URL(path, baseUrl));
    expect(res.status, path).toBe(200);
    expect(res.headers.get("content-type"), path).toMatch(/javascript/);
  }
});

// Prose flows and wraps as the page allows, never mid-word: Japanese and
// Chinese break at phrases and keep 。、ー off a line's start, and the
// About page names the game by its full title in each language.
it("wraps prose by phrase, and names the game in full on the About page", async () => {
  const css = await (await fetch(new URL("/app.css", baseUrl))).text();
  const rule = (sel: string) => css.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]+)\\}`))?.[2] ?? "";
  const cjk = rule(":root:lang(ja), :root:lang(zh-CN)");
  expect(cjk).toMatch(/word-break: auto-phrase/);
  expect(cjk).toMatch(/line-break: strict/);
  expect(rule("footer, body.readme p, .lobby p")).toMatch(/text-wrap: pretty/);
  for (const [path, title] of [["/about", "Losscut! Kurumi's FX Fantasy"], ["/ja/about", "ロスカット！ くるみちゃんの FXファンタジー"], ["/zh/about", "强制平仓！久留美的FX白日梦"]]) {
    const { doc } = await get(path);
    expect(doc!.querySelector("h1")?.textContent, path).toContain(title);
  }
});

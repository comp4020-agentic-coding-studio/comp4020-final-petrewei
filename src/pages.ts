// The pages as a player is sent them: each template with its {{slots}} filled, in each language. The
// server and the checks build a page the same way, from here, so a check sees what a visitor is sent.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { T } from "../public/i18n.js";

const ROOT = join(import.meta.dirname, "..");
const read = (file: string): string => readFileSync(join(ROOT, file), "utf8");

// Each page in each language at its own address: English at /, Japanese
// under /ja/, Chinese under /zh/ (ADR 0016). The market is the same page,
// and the same rooms, in every language; only its words change, and the
// server writes them in from the start, so the title, the html lang and a
// link's preview are right before any script runs.
export const LANGS = ["en", "ja", "zh"] as const;
export type Lang = (typeof LANGS)[number];
export const HTMLLANG: Record<Lang, string> = { en: "en", ja: "ja", zh: "zh-CN" };
export const prefix = (lang: Lang): string => (lang === "en" ? "" : `/${lang}`);
export const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const alternates = (page: "" | "about"): string =>
  LANGS.map((l) => `  <link rel="alternate" hreflang="${HTMLLANG[l]}" href="${prefix(l)}/${page}">`).join("\n") +
  `\n  <link rel="alternate" hreflang="x-default" href="/${page}">`;
// The web fonts every page loads: JetBrains Mono for numbers, M PLUS
// Rounded 1c for Latin and kana, and Noto Sans JP, SC and KR (OFL) for
// every Chinese character and Hangul, so Windows and Linux never fall to
// a mismatched system face. Google serves each in small slices by
// character, so a page fetches only the glyphs it shows.
export const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=M+PLUS+Rounded+1c:wght@400;700;800&family=Noto+Sans+JP:wght@400;700;800&family=Noto+Sans+SC:wght@400;700;800&family=Noto+Sans+KR:wght@400;700;800&display=swap">`;
// A page is a template with {{slots}}. The header is one part, shared by the market and
// About: the market fills its two slots with the tabs and the name button, About leaves
// them empty. A slot with no value is an error at startup, so a typo cannot ship a blank.
const fill = (template: string, vars: Record<string, string>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`no value for {{${k}}}`);
    return vars[k];
  });
const market = read("public/index.html");
const header = read("public/parts/header.html");
// The market keeps music and the theme in its Settings, beside its achievements (ADR 0083), so the header holds the
// same number of buttons; other pages keep them in the header.
const MARKET_ONLY = { tabs: read("public/parts/tabs.html"), whoami: read("public/parts/whoami.html"), feats: read("public/parts/feats.html") };
const sound = read("public/parts/sound.html");
const slotsIn = (lang: Lang): Record<string, string> => {
  const ui = T[lang].ui;
  return {
    htmllang: HTMLLANG[lang],
    lang,
    title: escape(`${ui.logo}${ui.titleJoin}${ui.sub}`),
    alternates: alternates(""),
    fonts: FONTS,
    home: `${prefix(lang)}/`,
    logo: escape(ui.logo),
    sub: escape(ui.sub),
    about: `${prefix(lang)}/about`,
  };
};
export const headerIn = (lang: Lang, onMarket: boolean): string => fill(header, { ...slotsIn(lang), tabs: onMarket ? MARKET_ONLY.tabs : "", whoami: onMarket ? MARKET_ONLY.whoami : "", feats: onMarket ? MARKET_ONLY.feats : "", sound: onMarket ? "" : sound });
export const marketIn = (lang: Lang): string => fill(market, { ...slotsIn(lang), header: headerIn(lang, true) });

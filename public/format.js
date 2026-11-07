// Shared by the market, the log and the tutorial: play money in Australian dollars, and a price of a pair
// to five significant digits, so 158.45 and 1.2013 are as long as each other.
export const quoted = (p) => p.toPrecision(5);
export const aud = (n) => `${n < 0 ? "−" : ""}A$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
// A figure's colour on the page: a gain up, a loss down, nothing at zero.
export const tone = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");
// The locale a page writes dates in: Australian English for English, otherwise the page's own language.
export const locale = (lang) => (lang === "en" ? "en-AU" : lang);
// A moment as Live shows it (ADR 0087): the weekday and time in Sydney, in the page's language.
export const sydneyTime = (ms, lang) => new Date(ms).toLocaleString(locale(lang), { timeZone: "Australia/Sydney", weekday: "short", hour: "2-digit", minute: "2-digit" });

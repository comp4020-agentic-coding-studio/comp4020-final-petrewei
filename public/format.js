// Shared by the market, the log and the tutorial: play money in Australian dollars, and a price of a pair
// to five significant digits, so 158.45 and 1.2013 are as long as each other.
export const quoted = (p) => p.toPrecision(5);
export const aud = (n) => `${n < 0 ? "−" : ""}A$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
// A figure's colour on the page: a gain up, a loss down, nothing at zero.
export const tone = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");
// The locale a page writes dates in: Australian English for English, otherwise the page's own language.
export const locale = (lang) => (lang === "en" ? "en-AU" : lang);
// The time zone times are shown in: the browser's own unless the viewer chose one in Settings. A zone the browser
// does not know falls back to its own, so a time never fails to show.
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
let zone = "";
export const zoneNow = () => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone || browserZone() });
    return zone || browserZone();
  } catch {
    return browserZone();
  }
};
export const setZone = (z) => (zone = z || "");
// A moment as a page shows it: the weekday and time in the viewer's zone, on a 24-hour clock in the page's language,
// so a time never runs to "am" or "pm" and a narrow clock never overflows.
export const localTime = (ms, lang) => new Date(ms).toLocaleString(locale(lang), { timeZone: zoneNow(), weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
// A feed line's time: the hour and minute on a 24-hour clock in the viewer's zone, with the weekday too when it was
// an earlier day, so a timeline reads "14:05" today and "Sat 09:12" for older news.
export const feedTime = (ms, lang, now = Date.now()) => {
  const day = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: zoneNow() });
  const opts = { timeZone: zoneNow(), hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(day(ms) === day(now) ? {} : { weekday: "short" }) };
  return new Date(ms).toLocaleString(locale(lang), opts);
};
// The zone's short name at a moment, as "AEDT" or "GMT+9", for a line that says which zone a time is in.
export const zoneName = (ms, lang) => new Intl.DateTimeFormat(locale(lang), { timeZone: zoneNow(), timeZoneName: "short" }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? "";
// Every zone the browser knows (the IANA list it ships, so none is kept by hand), as Settings offers them: the common
// few first, then the rest by region, each with its offset now, as "Tokyo (GMT+9)". A browser without the list keeps
// the common few.
export const COMMON_ZONES = ["Australia/Sydney", "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore", "Europe/London", "Europe/Zurich", "America/New_York", "UTC"];
export function zoneGroups(now = Date.now()) {
  /** @type {string[]} */
  let all = [];
  try { all = Intl.supportedValuesOf("timeZone"); } catch { /* an older browser */ }
  const offset = (z) => { try { return new Intl.DateTimeFormat("en", { timeZone: z, timeZoneName: "shortOffset" }).formatToParts(new Date(now)).find((p) => p.type === "timeZoneName")?.value ?? ""; } catch { return ""; } };
  const label = (z) => `${z.split("/").slice(1).join(" / ").replaceAll("_", " ") || z} (${offset(z)})`;
  /** @type {Map<string, { value: string, label: string }[]>} */
  const groups = new Map([["", COMMON_ZONES.map((z) => ({ value: z, label: label(z) }))]]);
  for (const z of all) {
    if (!z.includes("/") || COMMON_ZONES.includes(z)) continue;
    const region = z.split("/")[0];
    groups.set(region, [...(groups.get(region) ?? []), { value: z, label: label(z) }]);
  }
  return groups;
}

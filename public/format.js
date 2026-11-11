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
let selectedZone = "";
let resolvedZone;
let calendarDay;
const timeFormats = new Map();

export const zoneNow = () => {
  if (resolvedZone) return resolvedZone;
  if (selectedZone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: selectedZone });
      return resolvedZone = selectedZone;
    } catch { /* fall back to the browser's zone */ }
  }
  return resolvedZone = browserZone();
};

export function setZone(value) {
  const next = value || "";
  if (next !== selectedZone || !next) {
    selectedZone = next;
    resolvedZone = undefined;
    calendarDay = undefined;
    timeFormats.clear();
  }
  return selectedZone;
}

function formatsFor(lang) {
  let formats = timeFormats.get(lang);
  if (!formats) {
    const timeZone = zoneNow();
    const time = { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    formats = {
      time: new Intl.DateTimeFormat(locale(lang), time),
      weekday: new Intl.DateTimeFormat(locale(lang), { ...time, weekday: "short" }),
      zone: new Intl.DateTimeFormat(locale(lang), { timeZone, timeZoneName: "short" }),
    };
    timeFormats.set(lang, formats);
  }
  return formats;
}

// A moment on a 24-hour clock in the viewer's language and zone.
export const localTime = (ms, lang) => Number.isFinite(ms) ? formatsFor(lang).weekday.format(ms) : new Date(ms).toLocaleString(locale(lang));

// A feed line shows a weekday only when it is from an earlier day in the viewer's zone.
export const feedTime = (ms, lang, now = Date.now()) => {
  if (!Number.isFinite(ms)) return new Date(ms).toLocaleString(locale(lang));
  calendarDay ??= new Intl.DateTimeFormat("en-CA", { timeZone: zoneNow(), year: "numeric", month: "numeric", day: "numeric" });
  const formats = formatsFor(lang);
  const sameDay = Number.isFinite(now) && calendarDay.format(ms) === calendarDay.format(now);
  return (sameDay ? formats.time : formats.weekday).format(ms);
};

// The zone's short name at a moment, as "AEDT" or "GMT+9".
export const zoneName = (ms, lang) => formatsFor(lang).zone.formatToParts(ms).find((p) => p.type === "timeZoneName")?.value ?? "";
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

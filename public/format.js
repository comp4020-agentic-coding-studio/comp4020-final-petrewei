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
// Every zone the browser knows (the IANA list it ships, so none is kept by hand), as Settings offers them: grouped by the
// time each has at that moment, UTC+0 first, then east to +14 and west from -1 to -12, each city under its offset and
// named by itself, so a player finds their time and then their city. A zone that has summer time moves a group when
// its clocks change, as the clock a player reads does. A browser without the list offers none, and "Browser time"
// still works.
const OFFSET = /^GMT(?:([+-])(\d\d):(\d\d))?$/;
export function zoneGroups(now = Date.now()) {
  /** @type {string[]} */
  let all = [];
  try { all = Intl.supportedValuesOf("timeZone"); } catch { /* an older browser */ }
  /** @param {string} zone minutes east of UTC at `now`, or null if the browser cannot say */
  const minutes = (zone) => {
    try {
      const text = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(new Date(now)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
      const m = OFFSET.exec(text);
      return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : null;
    } catch { return null; }
  };
  const name = (min) => `UTC${min < 0 ? "-" : "+"}${Math.floor(Math.abs(min) / 60)}${Math.abs(min) % 60 ? ":" + String(Math.abs(min) % 60).padStart(2, "0") : ""}`;
  /** @type {Map<number, { value: string, label: string }[]>} */
  const byOffset = new Map();
  for (const z of all) {
    if (!z.includes("/")) continue;
    const min = minutes(z);
    if (min === null) continue;
    byOffset.set(min, [...(byOffset.get(min) ?? []), { value: z, label: z.split("/").at(-1)?.replaceAll("_", " ") ?? z }]);
  }
  // UTC+0, then the east nearest first, then the west nearest first
  const order = [...byOffset.keys()].sort((a, b) => rank(a) - rank(b));
  function rank(min) { return min === 0 ? -Infinity : min > 0 ? min : 1e6 - min; }
  return new Map(order.map((min) => [name(min), (byOffset.get(min) ?? []).sort((a, b) => a.label.localeCompare(b.label))]));
}

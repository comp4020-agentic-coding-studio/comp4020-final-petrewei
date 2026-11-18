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
// Settings' time zones, one line for each time in use: "UTC+9 · Tokyo, Seoul". It is the shape of Windows' own list
// ("(UTC+09:00) Osaka, Sapporo, Tokyo"), with the cities merged under their offset, as selectors such as Slack's shorten
// a long list; a zone for every city was 418 lines. Each well-known city is kept with its own zone, and at any moment a
// line is the cities that keep the same time right then, so a line never names a city that is an hour away, and a city
// that changes its clocks moves to another line, as the clock a player reads does. The cities are Windows' own picks
// for each region. A line's zone is its first city's, so the clock keeps that zone's summer-time rules. A browser
// without the IANA list offers none, and "Browser time" still works.
// [city, its IANA zone], in the order a line names them
export const CITY_ZONES = {
  London: "Europe/London", Dublin: "Europe/Dublin", Lisbon: "Europe/Lisbon", Reykjavik: "Atlantic/Reykjavik",
  Paris: "Europe/Paris", Berlin: "Europe/Berlin", Rome: "Europe/Rome", Madrid: "Europe/Madrid", Lagos: "Africa/Lagos",
  Athens: "Europe/Athens", Helsinki: "Europe/Helsinki", Kyiv: "Europe/Kiev", Cairo: "Africa/Cairo", Johannesburg: "Africa/Johannesburg",
  Moscow: "Europe/Moscow", Istanbul: "Europe/Istanbul", Riyadh: "Asia/Riyadh", Nairobi: "Africa/Nairobi",
  Tehran: "Asia/Tehran", Dubai: "Asia/Dubai", Baku: "Asia/Baku", Kabul: "Asia/Kabul",
  Karachi: "Asia/Karachi", Tashkent: "Asia/Tashkent", Mumbai: "Asia/Calcutta", "New Delhi": "Asia/Calcutta", Colombo: "Asia/Colombo",
  Kathmandu: "Asia/Katmandu", Dhaka: "Asia/Dhaka", Almaty: "Asia/Almaty", Yangon: "Asia/Rangoon",
  Bangkok: "Asia/Bangkok", Jakarta: "Asia/Jakarta", Beijing: "Asia/Shanghai", "Hong Kong": "Asia/Hong_Kong", Singapore: "Asia/Singapore", Perth: "Australia/Perth",
  Eucla: "Australia/Eucla", Tokyo: "Asia/Tokyo", Seoul: "Asia/Seoul",
  Darwin: "Australia/Darwin", Adelaide: "Australia/Adelaide", Brisbane: "Australia/Brisbane", Sydney: "Australia/Sydney", Melbourne: "Australia/Melbourne",
  "Lord Howe Island": "Australia/Lord_Howe", Noumea: "Pacific/Noumea", Magadan: "Asia/Magadan", Auckland: "Pacific/Auckland", Wellington: "Pacific/Auckland", Fiji: "Pacific/Fiji",
  "Chatham Islands": "Pacific/Chatham", Tonga: "Pacific/Tongatapu", Samoa: "Pacific/Apia", Kiritimati: "Pacific/Kiritimati",
  Azores: "Atlantic/Azores", "Cabo Verde": "Atlantic/Cape_Verde", "South Georgia": "Atlantic/South_Georgia", "Sao Paulo": "America/Sao_Paulo", "Buenos Aires": "America/Argentina/Buenos_Aires", Montevideo: "America/Montevideo",
  Newfoundland: "America/St_Johns", Halifax: "America/Halifax", Caracas: "America/Caracas", Santiago: "America/Santiago",
  "New York": "America/New_York", Toronto: "America/Toronto", Bogota: "America/Bogota", Lima: "America/Lima",
  Chicago: "America/Chicago", "Mexico City": "America/Mexico_City", Winnipeg: "America/Winnipeg",
  Denver: "America/Denver", Phoenix: "America/Phoenix", Calgary: "America/Edmonton", "Los Angeles": "America/Los_Angeles", Vancouver: "America/Vancouver", Tijuana: "America/Tijuana",
  Anchorage: "America/Anchorage", "Marquesas Islands": "Pacific/Marquesas", Honolulu: "Pacific/Honolulu", Tahiti: "Pacific/Tahiti", "Pago Pago": "Pacific/Pago_Pago", Midway: "Pacific/Midway",
};
const OFFSET = /^GMT(?:([+-])(\d\d):(\d\d))?$/;
const minutesAt = (zone, at) => {
  try {
    const text = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(new Date(at)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const m = OFFSET.exec(text);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : null;
  } catch { return null; }
};
const offsetName = (min) => `UTC${min < 0 ? "-" : "+"}${Math.floor(Math.abs(min) / 60)}${Math.abs(min) % 60 ? ":" + String(Math.abs(min) % 60).padStart(2, "0") : ""}`;
const rank = (min) => (min === 0 ? -Infinity : min > 0 ? min : 1e6 - min);
// Four cities are enough to find a time by; a line names no more than that, however many share it.
const MOST = 4;
/** @returns {{ offset: string, value: string, cities: string[] }[]} the lines at that moment: UTC+0, then east, then west */
export function zoneLines(at = Date.now()) {
  /** @type {string[]} */
  let known = [];
  try { known = Intl.supportedValuesOf("timeZone"); } catch { /* an older browser */ }
  if (!known.length) return [];
  // a zone this browser lists under its old or its new name is stored as the one it lists, so a saved choice is known
  const ALIAS = { "Europe/Kiev": "Europe/Kyiv", "Asia/Calcutta": "Asia/Kolkata", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Rangoon": "Asia/Yangon" };
  const listed = (zone) => [zone, ALIAS[zone], Object.keys(ALIAS).find((k) => ALIAS[k] === zone)].find((z) => z && known.includes(z));
  /** @type {Map<number, { offset: string, value: string, cities: string[] }>} */
  const byMinutes = new Map();
  for (const [city, zone] of Object.entries(CITY_ZONES)) {
    const value = listed(zone);
    const min = value ? minutesAt(value, at) : null;
    if (min === null) continue;
    const line = byMinutes.get(min) ?? { offset: offsetName(min), value, cities: [] };
    if (line.cities.length < MOST && !line.cities.includes(city)) line.cities.push(city);
    byMinutes.set(min, line);
  }
  return [...byMinutes.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map((e) => e[1]);
}
/** The line a zone sits on at that moment, such as "UTC+1" for Europe/London in summer, or null if it has none. */
export function lineOf(at, zone) {
  const min = minutesAt(zone, at);
  return min === null ? null : offsetName(min);
}

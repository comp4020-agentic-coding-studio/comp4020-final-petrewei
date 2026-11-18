import { describe, expect, it } from "vitest";
import { quoted } from "../public/format.js";

// Every price the player reads has five significant digits, so a yen pair and a euro pair are
// as long as each other, and a pair near 100 does not show more than it can know.
it("writes every price to five significant digits, whatever the pair", () => {
  const cases: [number, string][] = [
    [158.452, "158.45"],
    [107.29, "107.29"],
    [55.012, "55.012"],
    [1.20134, "1.2013"],
    [1.0284, "1.0284"],
    [7.2851, "7.2851"],
    [0.85134, "0.85134"],
    [0.65, "0.65000"],
  ];
  for (const [price, shown] of cases) {
    expect(quoted(price), String(price)).toBe(shown);
    expect(quoted(price).replace(/^0\.0*|\./g, "").length, String(price)).toBe(5);
  }
});

// Times show in the viewer's time zone, the browser's own unless chosen in Settings, on a 24-hour clock so a time
// never runs to "am" or "pm" and a narrow clock never overflows.
describe("times", () => {
  it("writes a moment on a 24-hour clock in the chosen zone, and names the zone", async () => {
    const { localTime, setZone, zoneName } = await import("../public/format.js");
    const at = Date.parse("2026-11-09T13:05:00Z");
    setZone("Asia/Tokyo");
    expect(localTime(at, "en")).toMatch(/22:05/);
    expect(localTime(at, "en")).not.toMatch(/am|pm/i);
    expect(zoneName(at, "en")).toMatch(/GMT\+9|JST/);
    setZone("Europe/London");
    expect(localTime(at, "en")).toMatch(/13:05/);
    // a zone the browser does not know falls back to its own, never throws
    setZone("Not/AZone");
    expect(() => localTime(at, "en")).not.toThrow();
    setZone("");
  });

  // The formatters are kept per language and zone, so a second look is not slower; a change of either must show at once.
  it("shows a change of language after the same moment was written in another, and of zone after both", async () => {
    const { localTime, feedTime, zoneName, setZone } = await import("../public/format.js");
    const at = Date.parse("2026-11-09T13:05:00Z");
    const now = Date.parse("2026-11-12T00:00:00Z");
    setZone("Asia/Tokyo");
    const english = [localTime(at, "en"), feedTime(at, "en", now), zoneName(at, "en")];
    const japanese = [localTime(at, "ja"), feedTime(at, "ja", now), zoneName(at, "ja")];
    expect(japanese[0], "the weekday is in the page's language").not.toBe(english[0]);
    expect(japanese[0]).toMatch(/月/);
    expect(english[0]).toMatch(/Mon/);
    // asked again after the other language, each is still its own
    expect(localTime(at, "en")).toBe(english[0]);
    expect(localTime(at, "ja")).toBe(japanese[0]);
    // and a zone chosen after both is seen in both
    setZone("Europe/London");
    expect(localTime(at, "en")).toMatch(/13:05/);
    expect(localTime(at, "ja")).toMatch(/13:05/);
    expect(localTime(at, "en")).not.toBe(english[0]);
    setZone("");
  });

  // Settings offers one line per time, UTC+0 first, then east to +14 and west from -1 to -12: "UTC+9 · Tokyo, Seoul". It
  // is the shape of Windows' own time-zone list ("(UTC+09:00) Osaka, Sapporo, Tokyo"), with the cities merged under their
  // offset as a long list is shortened in selectors such as Slack's (NN/g, "It's Time We Addressed Time-Zone
  // Selectors"). A player picks their time, never a city, and the clock follows the time zone behind that line.
  describe("the time-zone list", () => {
    const winter = Date.parse("2026-01-15T12:00:00Z");
    const summer = Date.parse("2026-07-15T12:00:00Z");
    const ianaCities = () => Intl.supportedValuesOf("timeZone").filter((z) => z.includes("/"));

    it("has one line for each offset in use, with 1 to 4 well-known cities named after it", async () => {
      const { zoneLines } = await import("../public/format.js");
      for (const at of [winter, summer]) {
        const lines = zoneLines(at);
        expect(lines.length, "about forty lines, not hundreds").toBeLessThan(45);
        expect(new Set(lines.map((l: { offset: string }) => l.offset)).size, "an offset is listed once").toBe(lines.length);
        for (const l of lines as { offset: string; cities: string[]; value: string }[]) {
          expect(l.cities.length, `${l.offset} names cities`).toBeGreaterThanOrEqual(1);
          expect(l.cities.length, `${l.offset} names few enough to read in one line`).toBeLessThanOrEqual(4);
          expect(ianaCities(), `${l.offset}'s zone exists in this browser`).toContain(l.value);
        }
      }
    });

    it("puts UTC+0 first, then the east, then the west, nearest first", async () => {
      const { zoneLines } = await import("../public/format.js");
      const heads = (zoneLines(winter) as { offset: string }[]).map((l) => l.offset);
      expect(heads[0], "the list begins at UTC+0").toBe("UTC+0");
      const minutes = heads.map((h) => { const m = h.match(/^UTC([+-])(\d+)(?::(\d+))?$/)!; return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)); });
      const east = minutes.filter((m) => m > 0), west = minutes.filter((m) => m < 0);
      expect(minutes.slice(1, 1 + east.length), "then the east, nearest first").toEqual([...east].sort((a, b) => a - b));
      expect(minutes.slice(1 + east.length), "then the west, nearest first").toEqual([...west].sort((a, b) => b - a));
    });

    it("sets the clock to the offset it names: the zone behind each line has that offset at that moment", async () => {
      const { zoneLines } = await import("../public/format.js");
      const offsetOf = (z: string, at: number) => new Intl.DateTimeFormat("en", { timeZone: z, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")!.value.replace("GMT", "") || "+00:00";
      const minutes = (o: string) => { const m = o.match(/^([+-])(\d\d):(\d\d)$/)!; return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])); };
      for (const at of [winter, summer]) for (const l of zoneLines(at) as { offset: string; value: string }[]) {
        const m = l.offset.match(/^UTC([+-])(\d+)(?::(\d+))?$/)!;
        const want = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
        expect(minutes(offsetOf(l.value, at)), `${l.offset} is ${l.value}`).toBe(want);
      }
    });

    // The cities named on a line are the cities that keep that time: Adelaide is not on the line Darwin is, and Sydney
    // is not on Brisbane's, in either season, whatever the one zone behind the line says.
    it("names only cities that really have that offset at that moment, in winter and in summer", async () => {
      const { zoneLines, CITY_ZONES } = await import("../public/format.js");
      const offsetOf = (z: string, at: number) => new Intl.DateTimeFormat("en", { timeZone: z, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")!.value.replace("GMT", "") || "+00:00";
      const name = (o: string) => { const m = o.match(/^([+-])(\d\d):(\d\d)$/); if (!m) return "UTC+0"; const mins = Number(m[2]) * 60 + Number(m[3]); return `UTC${m[1]}${Math.floor(mins / 60)}${mins % 60 ? ":" + String(mins % 60).padStart(2, "0") : ""}`; };
      for (const at of [winter, summer]) for (const l of zoneLines(at) as { offset: string; cities: string[] }[]) {
        for (const city of l.cities) {
          const zone = CITY_ZONES[city];
          expect(zone, `${city} has a zone`).toBeDefined();
          expect(name(offsetOf(zone, at)), `${city} is on ${l.offset} at ${new Date(at).toISOString().slice(0, 7)}`).toBe(l.offset);
        }
      }
    });

    it("lists every offset any of its cities has, winter or summer, so none is left out", async () => {
      const { zoneLines, CITY_ZONES } = await import("../public/format.js");
      const offsetOf = (z: string, at: number) => new Intl.DateTimeFormat("en", { timeZone: z, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")!.value.replace("GMT", "") || "+00:00";
      for (const at of [winter, summer]) {
        const wanted = new Set(Object.values(CITY_ZONES as Record<string, string>).map((z) => offsetOf(z, at)));
        const lines = zoneLines(at) as { offset: string }[];
        expect(lines.length, "a line for each offset a city has").toBe(wanted.size);
      }
    });

    it("moves with summer time: London is on the UTC+0 line in winter and UTC+1 in summer, and India stays on UTC+5:30", async () => {
      const { zoneLines, lineOf } = await import("../public/format.js");
      expect(lineOf(winter, "Europe/London")).toBe("UTC+0");
      expect(lineOf(summer, "Europe/London")).toBe("UTC+1");
      const india = ["Asia/Kolkata", "Asia/Calcutta"].find((z) => ianaCities().includes(z))!;
      expect(lineOf(winter, india)).toBe("UTC+5:30");
      expect(lineOf(summer, india)).toBe("UTC+5:30");
      expect((zoneLines(winter) as { offset: string }[]).length).toBeGreaterThan(30);
    });
  });

  it("writes a feed line's time as the hour today, with the weekday for an earlier day", async () => {
    const { feedTime, setZone } = await import("../public/format.js");
    setZone("UTC");
    const now = Date.parse("2026-11-09T15:00:00Z");
    expect(feedTime(Date.parse("2026-11-09T14:05:00Z"), "en", now)).toBe("14:05");
    expect(feedTime(Date.parse("2026-11-07T09:12:00Z"), "en", now)).toMatch(/Sat.*09:12/);
    setZone("");
  });
});

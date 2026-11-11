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

  // Settings offers the zones by their time, UTC+0 first, then east to +14 and west from -1 to -12, with every city under
  // the offset it has at that moment (ADR 0099's neighbour in the same popup; the rule is Peter's): a player finds their
  // time and then their city, and nothing is listed twice or left out.
  describe("the time-zone list", () => {
    const winter = Date.parse("2026-01-15T12:00:00Z");
    const summer = Date.parse("2026-07-15T12:00:00Z");
    const cities = () => Intl.supportedValuesOf("timeZone").filter((z) => z.includes("/"));

    it("lists every city once, under the offset it has at that moment, and no group empty", async () => {
      const { zoneGroups } = await import("../public/format.js");
      const groups = zoneGroups(winter);
      const seen = new Map<string, number>();
      for (const [, zones] of groups) {
        expect(zones.length, "a group is never empty").toBeGreaterThan(0);
        for (const z of zones) seen.set(z.value, (seen.get(z.value) ?? 0) + 1);
      }
      for (const z of cities()) expect(seen.get(z), `${z} is listed once`).toBe(1);
      expect(seen.size, "and nothing else is listed").toBe(cities().length);
    });

    it("puts UTC+0 first, then the east, then the west, with every group named by its offset", async () => {
      const { zoneGroups } = await import("../public/format.js");
      const heads = [...zoneGroups(winter).keys()];
      for (const h of heads) expect(h, "every group is an offset, with no common-zones group").toMatch(/^UTC[+-]\d+(?::\d+)?$/);
      expect(heads[0], "the list begins at UTC+0").toBe("UTC+0");
      const minutes = heads.map((h) => { const m = h.match(/^UTC([+-])(\d+)(?::(\d+))?$/)!; return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)); });
      const east = minutes.filter((m) => m > 0), west = minutes.filter((m) => m < 0);
      expect(minutes[0]).toBe(0);
      expect(minutes.slice(1, 1 + east.length), "then the east, nearest first").toEqual([...east].sort((a, b) => a - b));
      expect(minutes.slice(1 + east.length), "then the west, nearest first").toEqual([...west].sort((a, b) => b - a));
    });

    it("gives every city in a group the same offset at that moment, and labels it by its city alone", async () => {
      const { zoneGroups } = await import("../public/format.js");
      const offsetOf = (z: string, at: number) => new Intl.DateTimeFormat("en", { timeZone: z, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")!.value;
      for (const [head, zones] of zoneGroups(summer)) {
        const offsets = new Set(zones.map((z) => offsetOf(z.value, summer).replace("GMT", "") || "+00:00"));
        expect(offsets.size, `${head} holds one offset`).toBe(1);
        for (const z of zones) expect(z.label, "a city, not a path or an offset").toBe(z.value.split("/").at(-1)!.replaceAll("_", " "));
      }
    });

    it("moves a city when its clocks change: London is UTC+0 in winter and UTC+1 in summer", async () => {
      const { zoneGroups } = await import("../public/format.js");
      const groupOf = (at: number, zone: string) => [...zoneGroups(at)].find(([, zs]) => zs.some((z) => z.value === zone))![0];
      expect(groupOf(winter, "Europe/London")).toBe("UTC+0");
      expect(groupOf(summer, "Europe/London")).toBe("UTC+1");
      // India has no summer time and a half-hour offset; a browser lists it as Asia/Calcutta or Asia/Kolkata, the old
      // spelling or the new, so whichever it has is the one asked
      const india = ["Asia/Kolkata", "Asia/Calcutta"].find((z) => Intl.supportedValuesOf("timeZone").includes(z))!;
      expect(india, "the browser lists India under one of its two names").toBeDefined();
      expect(groupOf(winter, india)).toBe("UTC+5:30");
      expect(groupOf(summer, india)).toBe("UTC+5:30");
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

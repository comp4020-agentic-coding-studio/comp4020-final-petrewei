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

  it("writes a feed line's time as the hour today, with the weekday for an earlier day", async () => {
    const { feedTime, setZone } = await import("../public/format.js");
    setZone("UTC");
    const now = Date.parse("2026-11-09T15:00:00Z");
    expect(feedTime(Date.parse("2026-11-09T14:05:00Z"), "en", now)).toBe("14:05");
    expect(feedTime(Date.parse("2026-11-07T09:12:00Z"), "en", now)).toMatch(/Sat.*09:12/);
    setZone("");
  });
});

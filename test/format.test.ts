import { expect, it } from "vitest";
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

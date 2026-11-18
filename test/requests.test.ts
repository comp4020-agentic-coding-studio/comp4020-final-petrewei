import { expect, it } from "vitest";
import { makeAction } from "../public/requests.js";
it("constructs mode-specific requests and rejects missing required choices before sending", () => {
  expect(makeAction("rewind", "buy", { leverage: 10 })).toEqual({ mode: "rewind", kind: "buy", leverage: 10, share: 1, sl: null, tp: null });
  expect(makeAction("live", "close", { pair: "EUR/USD" })).toEqual({ mode: "live", kind: "close", pair: "EUR/USD" });
  expect(makeAction("rewind", "stop")).toEqual({ mode: "rewind", kind: "stop", pct: null });
  expect(makeAction("tutorial", "stop", { pct: 1 })).toEqual({ mode: "tutorial", kind: "stop", pct: 1 });
  expect(makeAction("tutorial", "stop")).toEqual({ mode: "tutorial", kind: "stop" });
  // every action the page offers reaches the server: a duel's challenge and accept, and Live's alerts (ADR 0095)
  expect(makeAction("random", "challenge", { code: "a1b2c3" })).toEqual({ mode: "random", kind: "challenge", code: "a1b2c3" });
  expect(makeAction("rewind", "accept", { code: "a1b2c3" })).toEqual({ mode: "rewind", kind: "accept", code: "a1b2c3" });
  expect(makeAction("live", "alert", { at: 1.1, pair: "EUR/USD" })).toEqual({ mode: "live", kind: "alert", at: 1.1, pair: "EUR/USD" });
  expect(makeAction("live", "unalert", { at: 1.1, pair: "AUD/JPY" })).toEqual({ mode: "live", kind: "unalert", at: 1.1, pair: "AUD/JPY" });
  // Live's pending order, one per pair, carries the chart's pair
  expect(makeAction("live", "pend", { side: -1, at: 1.1, leverage: 10, share: 0.25, sl: null, tp: null, pair: "EUR/USD" })).toEqual({ mode: "live", kind: "pend", side: -1, at: 1.1, leverage: 10, share: 0.25, sl: null, tp: null, pair: "EUR/USD" });
  expect(makeAction("live", "unpend", { pair: "EUR/USD" })).toEqual({ mode: "live", kind: "unpend", pair: "EUR/USD" });
  // Repay all (ADR 0100) carries its flag in both markets; a step carries none
  expect(makeAction("rewind", "repay", { all: true })).toEqual({ mode: "rewind", kind: "repay", all: true });
  expect(makeAction("live", "repay", { all: true, pair: "EUR/USD" })).toMatchObject({ mode: "live", kind: "repay", all: true });
  expect(makeAction("random", "repay")).toEqual({ mode: "random", kind: "repay" });
  expect(() => makeAction("live", "start")).toThrow("Invalid action for mode");
  expect(() => makeAction("random", "buy")).toThrow("Invalid action number");
});

// The server reads only what a request says: Repay all is `all: true` and nothing else, so a string or a number that
// looks like it pays one step, as a page that sends no flag does.
it("decodes Repay all only from all: true, and anything else as a step", async () => {
  const { tradeAction } = await import("../src/actions.ts");
  expect(tradeAction({ kind: "repay", all: true })).toEqual({ kind: "repay", all: true });
  for (const all of ["true", 1, "yes", null, undefined, {}]) expect(tradeAction({ kind: "repay", all }), String(all)).toEqual({ kind: "repay", all: false });
});

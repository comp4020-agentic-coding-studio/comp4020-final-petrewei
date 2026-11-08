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
  expect(() => makeAction("live", "start")).toThrow("Invalid action for mode");
  expect(() => makeAction("random", "buy")).toThrow("Invalid action number");
});
